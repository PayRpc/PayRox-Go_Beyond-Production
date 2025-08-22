#!/usr/bin/env bash

# ci-validation-pipeline.sh
# Production-ready CI/CD validation pipeline for PayRox contract splitting and deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FACTORY_ADDRESS="${FACTORY_ADDRESS:-}"
ORCHESTRATOR_ADDRESS="${ORCHESTRATOR_ADDRESS:-}"
MANIFEST_PATH="${MANIFEST_PATH:-./split-output/manifest.json}"
FACETS_DIR="${FACETS_DIR:-./artifacts/contracts/facets}"
NETWORK="${NETWORK:-localhost}"
DRY_RUN="${DRY_RUN:-false}"

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to run JSON task and check result
run_json_task() {
    local task_name="$1"
    shift
    local args="$@"

    log_info "Running $task_name..."
    local result
    if result=$(npx hardhat "$task_name" --json $args 2>&1); then
        local ok
        ok=$(echo "$result" | jq -r '.ok // false')
        if [[ "$ok" == "true" ]]; then
            log_success "$task_name completed successfully"
            echo "$result" | jq '.'
            return 0
        else
            log_error "$task_name failed"
            echo "$result" | jq '.'
            return 1
        fi
    else
        log_error "$task_name execution failed"
        echo "$result"
        return 1
    fi
}

# Step 1: Contract Splitter Validation
validate_contract_splitting() {
    log_info "🔍 STEP 1: Contract Splitting Validation"
    echo "========================================"

    # 1.1: Check selector parity
    log_info "Checking selector parity..."
    if ! npx ts-node tools/splitter/scripts/checkParity.ts; then
        log_error "Selector parity check failed"
        return 1
    fi
    log_success "Selector parity validated"

    # 1.2: Check EIP-170 compliance (runtime bytecode sizes)
    log_info "Checking EIP-170 compliance..."
    if ! npx ts-node tools/splitter/scripts/checkSizes.ts; then
        log_error "EIP-170 size check failed"
        return 1
    fi
    log_success "EIP-170 compliance validated"

    # 1.3: Build real Merkle tree with predictive codehashes
    log_info "Building Merkle tree..."
    if ! npx ts-node tools/splitter/scripts/buildMerkle.ts predictive; then
        log_error "Merkle tree generation failed"
        return 1
    fi
    log_success "Merkle tree generated successfully"
}

# Step 2: Manifest Validation
validate_manifest() {
    log_info "📋 STEP 2: Manifest Validation"
    echo "==============================="

    if [[ ! -f "$MANIFEST_PATH" ]]; then
        log_error "Manifest not found at $MANIFEST_PATH"
        return 1
    fi

    # 2.1: Self-check manifest (proofs, manifest hash)
    if ! run_json_task "payrox:manifest:selfcheck" "--path $MANIFEST_PATH"; then
        log_error "Manifest self-check failed"
        return 1
    fi

    # 2.2: Check facet codehashes if we have deployed contracts
    if [[ "$NETWORK" != "localhost" && "${CHECK_DEPLOYED_FACETS:-false}" == "true" ]]; then
        log_info "Checking deployed facet codehashes..."
        if ! run_json_task "payrox:manifest:selfcheck" "--path $MANIFEST_PATH --check-facets --network $NETWORK"; then
            log_error "Deployed facet codehash validation failed"
            return 1
        fi
    else
        log_warning "Skipping deployed facet validation (localhost or CHECK_DEPLOYED_FACETS=false)"
    fi
}

# Step 3: Factory Operations (Prediction & Staging)
validate_factory_operations() {
    log_info "🏭 STEP 3: Factory Operations"
    echo "============================="

    if [[ -z "$FACTORY_ADDRESS" ]]; then
        log_warning "FACTORY_ADDRESS not set, skipping factory operations"
        return 0
    fi

    # Find all facet bytecode files
    local facet_files
    if ! facet_files=$(find "$FACETS_DIR" -name "*.json" -type f); then
        log_error "No facet artifacts found in $FACETS_DIR"
        return 1
    fi

    for facet_file in $facet_files; do
        local facet_name
        facet_name=$(basename "$facet_file" .json)

        # Skip if not a facet contract
        if [[ ! "$facet_name" =~ Facet$ ]]; then
            continue
        fi

        log_info "Processing $facet_name..."

        # 3.1: Predict chunk address
        if ! run_json_task "payrox:chunk:predict" "--factory $FACTORY_ADDRESS --file $facet_file --network $NETWORK"; then
            log_error "Chunk prediction failed for $facet_name"
            return 1
        fi

        # 3.2: Stage chunk (dry run in CI, real in production)
        local stage_args="--factory $FACTORY_ADDRESS --file $facet_file --value 0.001 --network $NETWORK"
        if [[ "$DRY_RUN" == "true" ]]; then
            stage_args="$stage_args --dry-run"
        fi

        if ! run_json_task "payrox:chunk:stage" "$stage_args"; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log_error "Chunk staging dry-run failed for $facet_name"
            else
                log_error "Chunk staging failed for $facet_name"
            fi
            return 1
        fi
    done

    log_success "Factory operations completed"
}

# Step 4: Orchestration (if orchestrator is available)
validate_orchestration() {
    log_info "🎭 STEP 4: Orchestration Validation"
    echo "=================================="

    if [[ -z "$ORCHESTRATOR_ADDRESS" ]]; then
        log_warning "ORCHESTRATOR_ADDRESS not set, skipping orchestration"
        return 0
    fi

    # Generate a plan ID from the manifest hash
    local plan_id
    if [[ -f "$MANIFEST_PATH" ]]; then
        plan_id=$(cat "$MANIFEST_PATH" | jq -r '.header.versionBytes32 // "0x0000000000000000000000000000000000000000000000000000000000000001"')
    else
        plan_id="0x0000000000000000000000000000000000000000000000000000000000000001"
    fi

    local orch_args="--orchestrator $ORCHESTRATOR_ADDRESS --id $plan_id --gas-limit 1000000 --network $NETWORK"
    if [[ "$DRY_RUN" == "true" ]]; then
        orch_args="$orch_args --dry-run"
    fi

    if ! run_json_task "payrox:orchestrator:start" "$orch_args"; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_error "Orchestration dry-run failed"
        else
            log_error "Orchestration start failed"
        fi
        return 1
    fi

    log_success "Orchestration validation completed"
}

# Step 5: Post-deployment validation (if applicable)
validate_deployment() {
    log_info "🔍 STEP 5: Post-Deployment Validation"
    echo "===================================="

    # Only run if we have a dispatcher address and we're not in dry-run mode
    if [[ -z "${DISPATCHER_ADDRESS:-}" || "$DRY_RUN" == "true" ]]; then
        log_warning "DISPATCHER_ADDRESS not set or dry-run mode, skipping deployment validation"
        return 0
    fi

    # Compare on-chain routes vs manifest
    if ! run_json_task "payrox:dispatcher:diff" "--dispatcher $DISPATCHER_ADDRESS --path $MANIFEST_PATH --network $NETWORK"; then
        log_error "Deployment validation failed - routes don't match manifest"
        return 1
    fi

    log_success "Deployment validation passed"
}

# Step 6: Generate validation report
generate_report() {
    log_info "📊 STEP 6: Generating Validation Report"
    echo "======================================"

    local report_file="validation-report-$(date +%Y%m%d-%H%M%S).json"

    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "network": "$NETWORK",
  "dryRun": $DRY_RUN,
  "manifestPath": "$MANIFEST_PATH",
  "factoryAddress": "${FACTORY_ADDRESS:-null}",
  "orchestratorAddress": "${ORCHESTRATOR_ADDRESS:-null}",
  "dispatcherAddress": "${DISPATCHER_ADDRESS:-null}",
  "steps": {
    "contractSplitting": true,
    "manifestValidation": true,
    "factoryOperations": $([ -n "$FACTORY_ADDRESS" ] && echo "true" || echo "false"),
    "orchestration": $([ -n "$ORCHESTRATOR_ADDRESS" ] && echo "true" || echo "false"),
    "deploymentValidation": $([ -n "${DISPATCHER_ADDRESS:-}" ] && [ "$DRY_RUN" != "true" ] && echo "true" || echo "false")
  },
  "artifacts": {
    "manifest": "$([ -f "$MANIFEST_PATH" ] && echo "present" || echo "missing")",
    "merkleTree": "$([ -f "./split-output/merkle.json" ] && echo "present" || echo "missing")",
    "facetArtifacts": "$(ls "$FACETS_DIR"/*.json 2>/dev/null | wc -l) files"
  }
}
EOF

    log_success "Validation report generated: $report_file"
    cat "$report_file" | jq '.'
}

# Main execution flow
main() {
    log_info "🚀 PayRox CI/CD Validation Pipeline"
    echo "===================================="
    log_info "Network: $NETWORK"
    log_info "Dry Run: $DRY_RUN"
    log_info "Manifest: $MANIFEST_PATH"
    echo ""

    # Check prerequisites
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi

    if ! command -v npx &> /dev/null; then
        log_error "npx is required but not installed"
        exit 1
    fi

    # Compile contracts first
    log_info "Compiling contracts..."
    if ! npx hardhat compile --network "$NETWORK"; then
        log_error "Contract compilation failed"
        exit 1
    fi
    log_success "Contracts compiled"

    # Run validation steps
    validate_contract_splitting || exit 1
    validate_manifest || exit 1
    validate_factory_operations || exit 1
    validate_orchestration || exit 1
    validate_deployment || exit 1
    generate_report || exit 1

    log_success "🎉 All validation steps completed successfully!"
    echo ""
    log_info "Summary:"
    echo "• Contract splitting: ✅ Validated"
    echo "• Manifest integrity: ✅ Verified"
    echo "• Factory operations: $([ -n "$FACTORY_ADDRESS" ] && echo "✅ Tested" || echo "⏭️  Skipped")"
    echo "• Orchestration: $([ -n "$ORCHESTRATOR_ADDRESS" ] && echo "✅ Validated" || echo "⏭️  Skipped")"
    echo "• Deployment: $([ -n "${DISPATCHER_ADDRESS:-}" ] && [ "$DRY_RUN" != "true" ] && echo "✅ Verified" || echo "⏭️  Skipped")"
    echo ""
    log_success "Pipeline ready for production deployment! 🚀"
}

# Run main function
main "$@"
