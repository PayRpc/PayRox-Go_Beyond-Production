# PayRox Production Release System

## Overview

The PayRox Production Release System is a comprehensive automation framework for safe, validated deployments to production networks. It implements a 6-step workflow with comprehensive validation gates as specified in the go-live runbook.

## Components

### 1. Release Pipeline (`tools/release-pipeline.js`)

**Purpose**: Main orchestration script implementing the complete release workflow.

**Usage**:

```bash
# Production release (requires network)
npm run release -- mainnet

# Dry run (local validation only)
npm run release:dry

# Local testing (localhost network)
npm run release:local

# Skip deployment (validation only)
npm run release:no-deploy -- mainnet
```

**6-Step Workflow**:

1. **Build Predictive Artifacts**: Generate deployment plan, selectors, codehashes
2. **Deploy Facets**: Execute deployment to target network
3. **Build Observed Artifacts**: Re-analyze deployed contracts
4. **Validate Gates**: Comprehensive validation (codehash parity, EIP-170, Mythril security)
5. **Sign Manifest**: Cryptographic attestation of deployment
6. **Summary**: PASS/FAIL report with next steps

### 2. Commit/Apply Workflow

**Commit Phase** (`scripts/commit-plan.ts`):

- Commits deployment plan with hash validation
- Activates delay window (24-hour default)
- Creates `commit-result.json` tracking file

**Apply Phase** (`scripts/apply-plan.ts`):

- Validates delay window has elapsed
- Apply after governance delay with explicit approval (e.g., `LIVE_ACK=<PlanID>`)
- Creates `apply-result.json` with results

### 3. Validation Infrastructure

**Release Gates Tester** (`tools/test-release-gates.js`):

- Tests all validation logic in isolation
- Validates artifact structure and consistency
- Ensures gate logic works correctly

**Post-Apply Validation** (`scripts/validation/post-apply-checks.js`):

- Validates deployment after plan application
- Checks loupe parity, manifest root, selector coverage
- Verifies EXTCODEHASH and function calls

**Self-Check Integration**:

- CI selfcheck understands split artifact format
- Validates `manifest.root.json`, `proofs.json`, `deployment-plan.json`
- Uses task flag for split artifact mode validation

## Release Gates

### 1. Codehash Parity

- **Purpose**: Ensures deployed bytecode matches predictions
- **Validation**: Compares predictive vs observed codehashes
- **Gate**: FAIL if any codehash mismatch detected

### 2. Selector Set Validation

- **Purpose**: Ensures all selectors properly mapped
- **Validation**: Verifies selector count and structure consistency
- **Gate**: FAIL if selector mapping incomplete

### 3. EIP-170 Compliance

- **Purpose**: Ensures contract size limits met
- **Validation**: Checks all facets ≤ 24,576 bytes (keep ≥ 1 KB headroom)
- **Gate**: FAIL if any facet exceeds size limit

### 4. Mythril Security Scanning

- **Purpose**: Detects security vulnerabilities
- **Validation**: Runs security analysis with severity gating
- **Gate**: FAIL on Medium+ issues (configurable per branch)
- **Configuration**:
  - `MYTH_CMD`: Docker command (default: `docker run --rm`)
  - `MYTH_IMAGE`: Pinned image (default: `mythril/myth:0.24.6`)
  - `MYTH_SOLVER_TIMEOUT`: Optional solver timeout
  - **PR Branches**: High-only severity gate (fast)
  - **Main/Release**: Medium+High severity gate (strict)

### 5. Manifest Signing

- **Purpose**: Cryptographic attestation of deployment
- **Validation**: Signs deployment manifest with release key
- **Gate**: FAIL if signing process fails
- **Environment Variables**:
  - `SIGNER_KEY`: Private key for manifest signing
  - `DISPATCHER_ADDR`: Dispatcher contract address
  - `CHAIN_ID`: Target chain ID (optional, inferred from network)

## Security Features

### Fast PR Mode

- **PR Branches**: High-severity gate only (keeps PRs fast)
- **Main/Release**: Medium+ severity gate (strict security)
- **Configuration**: Automatic branch detection

### Severity Gating

```typescript
// Fast PR mode (High only)
const shouldFail = (results) => {
  return results.some(r => r.severity === 'High' && r.issues.length > 0);
};

// Strict mode (Medium + High)
const shouldFail = (results) => {
  return results.some(r =>
    ['Medium', 'High'].includes(r.severity) && r.issues.length > 0
  );
};
```

### Allowlist Filtering

- **Location**: `security/allowlist.myth.json`
- **Purpose**: Pre-approved findings with justifications
- **Format**: Issue pattern → justification mapping

## Artifacts Generated

### Core Split Artifacts

- **`manifest.root.json`**: Deployment manifest with merkle root, chainId, epoch, solc version
- **`deployment-plan.json`**: Complete deployment specification with facet addresses
- **`proofs.json`**: Merkle proofs for all selectors (required for diamond cuts)
- **`selectors.json`**: Canonical selector mapping with conflict resolution
- **`deployed-addresses.json`**: **Required for observed mode** - actual deployment addresses

### Tracking Files

- **`commit-result.json`**: Commit phase tracking with plan hash
- **`apply-result.json`**: Apply phase results with governance approval
- **`validation-result.json`**: Post-deployment validation results

### Security Artifacts

- **`mythril-src.latest.json`**: Security scan results (JSON format)
- **`mythril-src.sarif`**: SARIF format for GitHub Security tab integration
- **`mythril-addr.latest.json`**: Address-based security scan results
- **`mythril-addr.sarif`**: Address-based SARIF format for integration

## Artifact Verification

The system includes comprehensive artifact checking with the `tools/show-artifacts.ps1` script:

```powershell
# Quick check of all artifacts
.\tools\show-artifacts.ps1

# Custom output directory
.\tools\show-artifacts.ps1 -OutDir "./custom-output"
```

### Artifact Categories

**Core Deployment Files** (Required):

- `manifest.root.json` - Complete facet manifest
- `proofs.json` - Merkle proofs for verification
- `deployment-plan.json` - Deployment execution plan
- `selectors.json` - Function selector mappings

**Validation Files**:

- `SHA256SUMS` - Checksums for all generated artifacts
- `codehashes-predictive-*.json` - Predicted code hashes before deployment
- `codehashes-observed-*.json` - Observed code hashes after deployment
- `deployment-results.json` - Deployment execution results
- `orchestration-plan.json` - Service orchestration plan

**Security Files** (require Docker/Mythril):

- `mythril-src.latest.json` - Source code security scan results
- `mythril-addr.latest.json` - Address-based security scan results
- `mythril-src.sarif` - SARIF format for GitHub integration
- `mythril-addr.sarif` - Address-based SARIF format

**Governance Files** (optional):

- `commit-result.json` - Governance commit operation results
- `apply-result.json` - Governance apply operation results
- `manifest.sig.json` - Signed manifest for verification

## Release Pipeline Output

```text
🚀 PayRox Production Release Pipeline
====================================
Network: mainnet
Mode: LIVE

📦 Step 1: Building Predictive Artifacts...

### Validation Artifacts

- **`SHA256SUMS`**: Checksums for all generated artifacts
- **`codehashes-predictive-*.json`**: Predicted code hashes before deployment
- **`codehashes-observed-*.json`**: Observed code hashes after deployment

### Governance Artifacts (Optional)

- **`commit-result.json`**: Governance commit operation results
- **`apply-result.json`**: Governance apply operation results
- **`manifest.sig.json`**: Signed manifest for verification

## NPM Scripts

```json
{
  "release": "node tools/release-pipeline.js",
  "release:dry": "node tools/release-pipeline.js --dry-run",
  "release:local": "node tools/release-pipeline.js localhost",
  "release:no-deploy": "node tools/release-pipeline.js --skip-deploy"
}
```

## Example Output

```
🚀 PayRox Production Release Pipeline
====================================
Network: mainnet
Mode: LIVE

📦 Step 1: Building Predictive Artifacts...
✅ Generated 71 selectors
✅ Generated 12 codehashes
✅ Merkle root: 0x0b7d...3e57

📦 Step 2: Deploy Facets...
✅ Deployed all facets successfully

📦 Step 3: Building Observed Artifacts...
✅ Re-analyzed deployed contracts

📦 Step 4: Validate Gates...
✅ Codehash Parity: 12/12 matches
✅ Selector Set: 71 selectors validated
✅ EIP-170 Compliance: All facets ≤ 24KB
✅ Mythril Security: No High severity issues
✅ Manifest Signing: Successfully signed

📦 Step 5: Sign Manifest...
✅ Manifest signed with release key

📦 Step 6: Summary...
✅ ALL GATES PASSED - READY FOR PRODUCTION RELEASE

🆔 Plan ID: 0x778d...f8b
🌳 Merkle Root: 0x0b7d...3e57
```

## Integration with CI/CD

### GitHub Actions Integration

```yaml
- name: Production Release
  run: npm run release -- ${{ vars.NETWORK }}
  env:
    NETWORK: ${{ vars.NETWORK }}
    PRIVATE_KEY: ${{ secrets.RELEASE_KEY }}
    SIGNER_KEY: ${{ secrets.SIGNER_KEY }}
    DISPATCHER_ADDR: ${{ vars.DISPATCHER_ADDR }}
    CHAIN_ID: ${{ vars.CHAIN_ID }}
    MYTH_IMAGE: mythril/myth:0.24.6
```

### Manual Release Process

1. **Prepare**: Ensure all tests pass and security scans clean
2. **Commit**: `npm run release -- mainnet` (commits plan with governance delay)
3. **Wait**: 24-hour delay window for emergency stops
4. **Apply**: Apply after governance delay with explicit approval (`LIVE_ACK=<PlanID>`)
5. **Validate**: Post-deployment validation runs
6. **Tag**: `git tag v1.0.0` and push release tag

## Error Handling

### Common Failure Modes

- **Docker Missing**: Mythril requires Docker for security scanning
- **Network Issues**: Deployment timeouts or connection failures
- **Gate Failures**: Security issues or validation failures
- **Artifact Corruption**: File system or generation issues

### Recovery Procedures

- **Failed Gates**: Review and fix issues, re-run pipeline
- **Partial Deployment**: Use `--skip-deploy` to validate existing deployment
- **Emergency Stop**: Contact team to halt apply phase before delay expires

## Maintenance

### Regular Updates

- **Security Allowlist**: Review and update monthly
- **Gate Thresholds**: Adjust based on security posture
- **Timeout Values**: Tune based on network conditions

### Monitoring

- **Artifact Sizes**: Monitor for EIP-170 approach
- **Security Trends**: Track Mythril findings over time
- **Performance**: Monitor deployment times and gas usage

## Testing

### Validation Testing

```bash
# Test all gate logic
node tools/test-release-gates.js

# Test dry run
npm run release:dry

# Test local deployment
npm run release:local
```

### Integration Testing

```bash
# Full pipeline test (requires Docker)
npm run release:dry

# Security scanning test
npm run sec:myth:src
```

This system provides production-grade safety with comprehensive validation, security scanning, and audit trails for PayRox smart contract deployments.
