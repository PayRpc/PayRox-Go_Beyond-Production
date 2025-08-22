# PayRox Contract Splitting & Deployment Pipeline Documentation

This documentation describes the complete production-ready CI/CD pipeline for the PayRox contract splitting system, including validation, staging, and deployment capabilities.

## Overview

The PayRox contract splitting system includes:

1. **Contract Splitter Engine** - Core splitting logic with validation
2. **Hardhat Tasks** - Production deployment automation
3. **Validation Scripts** - Comprehensive checking and verification
4. **CI/CD Pipeline** - Automated testing and deployment workflows

## Architecture

```
PayRox Contract Splitting Pipeline
├── Contract Splitter (tools/splitter/)
│   ├── engine.ts - Core splitting logic
│   ├── demo.ts - Demonstration and testing
│   └── scripts/ - Validation utilities
├── Hardhat Tasks (tasks/payrox.ts)
│   ├── manifest:selfcheck - Verify manifest integrity
│   ├── chunk:predict - Predict CREATE2 addresses
│   ├── chunk:stage - Stage bytecode deployment
│   ├── orchestrator:start - Execute deployment plans
│   └── dispatcher:diff - Verify deployed routes
├── Validation Pipeline (scripts/)
│   ├── ci-validation-pipeline.sh - Bash validation script
│   └── ci-validation-pipeline.ps1 - PowerShell validation script
└── GitHub Actions (.github/workflows/)
    └── contract-splitting-pipeline.yml - Automated CI/CD
```

## Quick Start

### 1. Prerequisites

```bash
# Install dependencies
npm install

# Install system tools
sudo apt-get install jq  # Linux
brew install jq          # macOS
choco install jq         # Windows

# Compile contracts
npx hardhat compile
```

### 2. Run Contract Splitter

```bash
# Generate split output
npx ts-node tools/splitter/demo.ts

# Verify results
ls split-output/
# Should show: manifest.json, merkle.json, facet files
```

### 3. Validate Results

```bash
# Run full validation pipeline
./scripts/ci-validation-pipeline.sh

# Or use PowerShell on Windows
./scripts/ci-validation-pipeline.ps1
```

## Hardhat Tasks Reference

### Manifest Operations

#### `payrox:manifest:selfcheck`
Verifies manifest integrity and optionally checks deployed facet codehashes.

```bash
# Basic manifest verification
npx hardhat payrox:manifest:selfcheck --path ./split-output/manifest.json

# Include deployed facet verification
npx hardhat payrox:manifest:selfcheck \
  --path ./split-output/manifest.json \
  --check-facets \
  --network sepolia

# JSON output for CI/CD
npx hardhat payrox:manifest:selfcheck \
  --path ./split-output/manifest.json \
  --json
```

**Parameters:**
- `--path` - Path to manifest JSON file
- `--check-facets` - Verify deployed facet codehashes
- `--network` - Network for on-chain verification
- `--json` - Output in JSON format

### Factory Operations

#### `payrox:chunk:predict`
Predicts CREATE2 deployment addresses using DeterministicChunkFactory.

```bash
# Predict address for a facet
npx hardhat payrox:chunk:predict \
  --factory 0x1234567890123456789012345678901234567890 \
  --file ./artifacts/contracts/facets/SecurityFacet.sol/SecurityFacet.json \
  --network sepolia

# JSON output
npx hardhat payrox:chunk:predict \
  --factory 0x1234567890123456789012345678901234567890 \
  --file ./artifacts/contracts/facets/SecurityFacet.sol/SecurityFacet.json \
  --network sepolia \
  --json
```

**Parameters:**
- `--factory` - DeterministicChunkFactory address
- `--file` - Path to compiled contract artifact
- `--network` - Target network
- `--json` - Output in JSON format

#### `payrox:chunk:stage`
Stages bytecode chunks for CREATE2 deployment with fee estimation.

```bash
# Stage chunk with fee estimation
npx hardhat payrox:chunk:stage \
  --factory 0x1234567890123456789012345678901234567890 \
  --file ./artifacts/contracts/facets/SecurityFacet.sol/SecurityFacet.json \
  --value 0.001 \
  --network sepolia

# Dry run (estimate only)
npx hardhat payrox:chunk:stage \
  --factory 0x1234567890123456789012345678901234567890 \
  --file ./artifacts/contracts/facets/SecurityFacet.sol/SecurityFacet.json \
  --value 0.001 \
  --network sepolia \
  --dry-run

# JSON output for automation
npx hardhat payrox:chunk:stage \
  --factory 0x1234567890123456789012345678901234567890 \
  --file ./artifacts/contracts/facets/SecurityFacet.sol/SecurityFacet.json \
  --value 0.001 \
  --network sepolia \
  --json
```

**Parameters:**
- `--factory` - DeterministicChunkFactory address
- `--file` - Path to compiled contract artifact
- `--value` - ETH value to send (for fees)
- `--network` - Target network
- `--dry-run` - Estimate costs without execution
- `--json` - Output in JSON format

### Orchestration

#### `payrox:orchestrator:start`
Starts orchestration plan execution with cost analysis.

```bash
# Start orchestration plan
npx hardhat payrox:orchestrator:start \
  --orchestrator 0x1234567890123456789012345678901234567890 \
  --id 0x1234567890123456789012345678901234567890123456789012345678901234 \
  --gas-limit 1000000 \
  --network sepolia

# Dry run for cost estimation
npx hardhat payrox:orchestrator:start \
  --orchestrator 0x1234567890123456789012345678901234567890 \
  --id 0x1234567890123456789012345678901234567890123456789012345678901234 \
  --gas-limit 1000000 \
  --network sepolia \
  --dry-run

# JSON output
npx hardhat payrox:orchestrator:start \
  --orchestrator 0x1234567890123456789012345678901234567890 \
  --id 0x1234567890123456789012345678901234567890123456789012345678901234 \
  --gas-limit 1000000 \
  --network sepolia \
  --json
```

**Parameters:**
- `--orchestrator` - Orchestrator contract address
- `--id` - Plan ID (bytes32)
- `--gas-limit` - Gas limit for execution
- `--network` - Target network
- `--dry-run` - Estimate costs without execution
- `--json` - Output in JSON format

### Deployment Verification

#### `payrox:dispatcher:diff`
Compares on-chain dispatcher routes against manifest specifications.

```bash
# Verify deployment matches manifest
npx hardhat payrox:dispatcher:diff \
  --dispatcher 0x1234567890123456789012345678901234567890 \
  --path ./split-output/manifest.json \
  --network sepolia

# JSON output for automation
npx hardhat payrox:dispatcher:diff \
  --dispatcher 0x1234567890123456789012345678901234567890 \
  --path ./split-output/manifest.json \
  --network sepolia \
  --json
```

**Parameters:**
- `--dispatcher` - Dispatcher contract address
- `--path` - Path to manifest JSON file
- `--network` - Target network
- `--json` - Output in JSON format

## Validation Pipeline

### Local Validation

The validation pipeline performs comprehensive checks across all components:

#### Bash Version (Linux/macOS)
```bash
# Basic validation
./scripts/ci-validation-pipeline.sh

# With specific network
NETWORK=sepolia ./scripts/ci-validation-pipeline.sh

# With factory address
FACTORY_ADDRESS=0x1234567890123456789012345678901234567890 \
./scripts/ci-validation-pipeline.sh

# Dry run mode
DRY_RUN=true ./scripts/ci-validation-pipeline.sh

# Full production validation
NETWORK=mainnet \
FACTORY_ADDRESS=0x1234567890123456789012345678901234567890 \
ORCHESTRATOR_ADDRESS=0x1234567890123456789012345678901234567890 \
DISPATCHER_ADDRESS=0x1234567890123456789012345678901234567890 \
./scripts/ci-validation-pipeline.sh
```

#### PowerShell Version (Windows)
```powershell
# Basic validation
./scripts/ci-validation-pipeline.ps1

# With parameters
./scripts/ci-validation-pipeline.ps1 -Network sepolia -DryRun

# Full validation
./scripts/ci-validation-pipeline.ps1 `
  -Network mainnet `
  -FactoryAddress "0x1234567890123456789012345678901234567890" `
  -OrchestratorAddress "0x1234567890123456789012345678901234567890" `
  -DispatcherAddress "0x1234567890123456789012345678901234567890"
```

### Validation Steps

The pipeline performs these validation steps:

1. **Contract Splitting Validation**
   - Selector parity checking
   - EIP-170 compliance verification
   - Merkle tree generation with predictive codehashes

2. **Manifest Validation**
   - Manifest integrity verification
   - Merkle proof validation
   - Optional deployed facet codehash checking

3. **Factory Operations**
   - CREATE2 address prediction
   - Bytecode staging with fee estimation
   - Gas cost analysis

4. **Orchestration Validation**
   - Plan execution simulation
   - Transaction cost estimation
   - Execution path verification

5. **Post-Deployment Validation**
   - Route comparison against manifest
   - On-chain state verification
   - Deployment integrity confirmation

## CI/CD Integration

### GitHub Actions Workflow

The repository includes a comprehensive GitHub Actions workflow in `.github/workflows/contract-splitting-pipeline.yml`.

#### Trigger Events
- **Push** to `main` or `develop` branches (contract changes)
- **Pull Request** to `main` branch
- **Manual Dispatch** with deployment options

#### Workflow Jobs

1. **Contract Splitting Validation**
   - Runs on all triggers
   - Validates contract splitting logic
   - Generates artifacts and reports
   - Comments on PRs with results

2. **Factory Prediction**
   - Runs for non-localhost deployments
   - Predicts CREATE2 addresses
   - Uploads prediction artifacts

3. **Staging Deployment**
   - Runs on `develop` branch
   - Deploys to testnet environment
   - Performs comprehensive validation

4. **Production Deployment**
   - Runs on `main` branch only
   - Requires manual approval
   - Deploys to mainnet
   - Creates deployment records

#### Environment Variables

Set these secrets in your GitHub repository:

```bash
# Network RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY

# Contract Addresses
SEPOLIA_FACTORY_ADDRESS=0x...
SEPOLIA_ORCHESTRATOR_ADDRESS=0x...
MAINNET_FACTORY_ADDRESS=0x...
MAINNET_ORCHESTRATOR_ADDRESS=0x...

# Private Keys
STAGING_PRIVATE_KEY=0x...
PRODUCTION_PRIVATE_KEY=0x...
```

#### Manual Deployment

```bash
# Trigger staging deployment
gh workflow run contract-splitting-pipeline.yml \
  -f network=sepolia \
  -f deploy_mode=staging

# Trigger production deployment
gh workflow run contract-splitting-pipeline.yml \
  -f network=mainnet \
  -f deploy_mode=production
```

## Error Handling & Troubleshooting

### Common Issues

#### Selector Parity Failures
```bash
# Check selector mismatches
npx ts-node tools/splitter/scripts/checkParity.ts

# Common causes:
# - Missing function selectors in facets
# - Incorrect ABI generation
# - Inheritance chain issues
```

#### EIP-170 Size Violations
```bash
# Check contract sizes
npx ts-node tools/splitter/scripts/checkSizes.ts

# Solutions:
# - Split large facets further
# - Remove unused code
# - Optimize contract logic
```

#### Merkle Tree Generation Failures
```bash
# Regenerate with predictive mode
npx ts-node tools/splitter/scripts/buildMerkle.ts predictive

# Check for:
# - Zero codehashes (use predictive mode)
# - Missing facet artifacts
# - Incorrect hash calculations
```

#### Deployment Failures
```bash
# Check network connectivity
npx hardhat payrox:chunk:predict --factory $FACTORY --file $ARTIFACT --network $NETWORK

# Verify addresses
npx hardhat payrox:manifest:selfcheck --path manifest.json --check-facets --network $NETWORK

# Check balances and gas prices
```

### Debugging Output

Enable verbose logging:

```bash
# Bash pipeline
DEBUG=true ./scripts/ci-validation-pipeline.sh

# Hardhat tasks with JSON output
npx hardhat payrox:manifest:selfcheck --path manifest.json --json | jq '.'
```

### Recovery Procedures

#### Failed Staging Deployment
```bash
# 1. Check validation output
cat validation-report-*.json | jq '.steps'

# 2. Re-run specific failed step
npx hardhat payrox:chunk:stage --factory $FACTORY --file $ARTIFACT --dry-run

# 3. Address issues and retry
./scripts/ci-validation-pipeline.sh
```

#### Production Deployment Issues
```bash
# 1. Immediate rollback (if needed)
# Use existing dispatcher routes as fallback

# 2. Diagnostic check
npx hardhat payrox:dispatcher:diff \
  --dispatcher $DISPATCHER \
  --path manifest.json \
  --network mainnet \
  --json

# 3. Emergency recovery
# Deploy corrected manifest through orchestrator
```

## Best Practices

### Development Workflow

1. **Local Development**
   ```bash
   # Always validate locally first
   npx ts-node tools/splitter/demo.ts
   ./scripts/ci-validation-pipeline.ps1 -DryRun
   ```

2. **Pull Request Process**
   - Automated validation runs on PR
   - Review validation report in PR comments
   - Ensure all checks pass before merging

3. **Staging Deployment**
   - Automatic deployment on `develop` branch
   - Comprehensive testing in testnet environment
   - Validation before production promotion

4. **Production Deployment**
   - Manual approval required
   - Comprehensive pre-deployment checks
   - Post-deployment verification
   - Deployment record keeping

### Security Considerations

1. **Private Key Management**
   - Use GitHub Secrets for sensitive data
   - Separate keys for staging/production
   - Regular key rotation

2. **Contract Verification**
   - Always verify deployed contracts
   - Compare on-chain code with expectations
   - Monitor for unauthorized changes

3. **Gas Management**
   - Use dry-run mode for cost estimation
   - Set appropriate gas limits
   - Monitor gas price fluctuations

### Monitoring & Maintenance

1. **Regular Validation**
   ```bash
   # Weekly validation of production deployment
   npx hardhat payrox:dispatcher:diff \
     --dispatcher $PROD_DISPATCHER \
     --path manifest.json \
     --network mainnet
   ```

2. **Artifact Management**
   - Maintain deployment records
   - Archive validation reports
   - Track manifest version history

3. **Performance Monitoring**
   - Monitor gas consumption
   - Track deployment success rates
   - Analyze validation timing

## Advanced Usage

### Custom Validation Rules

Add custom validation logic to the pipeline:

```bash
# Add to validation script
custom_validation() {
    log_info "Running custom validation..."

    # Your custom checks here
    if ! your_custom_check; then
        log_error "Custom validation failed"
        return 1
    fi

    log_success "Custom validation passed"
    return 0
}
```

### Integration with Other Tools

#### Integrate with Tenderly
```bash
# Add to deployment script
tenderly_simulate() {
    npx hardhat payrox:orchestrator:start \
      --orchestrator $ORCHESTRATOR \
      --id $PLAN_ID \
      --dry-run \
      --json | jq '.simulationUrl'
}
```

#### Integrate with Defender
```bash
# Add monitoring hooks
defender_monitor() {
    curl -X POST "https://api.defender.openzeppelin.com/..." \
      -H "Authorization: Bearer $DEFENDER_TOKEN" \
      -d "{\"address\": \"$DISPATCHER_ADDRESS\"}"
}
```

### Multi-Network Deployment

Deploy to multiple networks simultaneously:

```bash
# Parallel deployment script
networks=("sepolia" "goerli" "polygon-mumbai")

for network in "${networks[@]}"; do
    echo "Deploying to $network..."
    NETWORK=$network ./scripts/ci-validation-pipeline.sh &
done

wait
echo "All deployments completed"
```

## Support & Contributing

### Getting Help

1. **Documentation Issues** - Check this README and inline code comments
2. **Validation Failures** - Review validation report JSON output
3. **Deployment Issues** - Check GitHub Actions logs and deployment records

### Contributing

1. **Code Changes** - Follow existing patterns and add tests
2. **Pipeline Improvements** - Test thoroughly in staging environment
3. **Documentation Updates** - Keep this README current with changes

### License

This project is licensed under the MIT License. See `LICENSE` file for details.
