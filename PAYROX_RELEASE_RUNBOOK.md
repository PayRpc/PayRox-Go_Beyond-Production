# PayRox Release Runbook
## Diamond + OrderedMerkle Production Deployment Guide

---

## 0) One-time Setup

### Repository Secrets
Navigate to **Repository → Settings → Secrets and variables → Actions**

Add the following secrets:
- `SIGNER_KEY` - EIP-712 signer private key (hex format, no 0x prefix)
- `DISPATCHER_ADDR` - ManifestDispatcher contract address (0x...)
- `CHAIN_ID` *(optional)* - Chain ID override (defaults to 1)

### CI Workflow Verification
Ensure these workflows are active:
- `.github/workflows/payrox-selfcheck.yml` - Main CI checks
- `.github/workflows/ci-selfcheck.yml` - Protected signing workflow

---

## 1) Local Development Workflow

### Green Path (Engineer Laptop)

```bash
# 1. Compile contracts and build predictive artifacts
npm run pipeline:predictive
# ✅ Outputs: manifest.root.json, codehashes-predictive-*.json, proofs.json, SHA256SUMS

# 2. Deploy facets to localhost (optional)
npx ts-node --transpile-only tools/splitter/scripts/deployFacets.ts
# ✅ Writes: split-output/deployed-addresses.json

# 3. Build observed artifacts from live deployment + auto-diff
npm run pipeline:observed
# ✅ Outputs: codehashes-observed-*.json + auto-diff vs predictive

# 4. Manual diff at any time
npm run pipeline:diff
```

### Expected Outputs (Green Path)
```
split-output/
├── manifest.root.json           # Signed manifest with EIP-712 header
├── codehashes-predictive-*.json # Predicted facet codehashes
├── codehashes-observed-*.json   # Live deployment codehashes
├── proofs.json                  # OrderedMerkle proofs per selector
├── deployment-plan.json         # Orchestration steps
├── orchestration-plan.json      # Router configuration
├── selectors.json              # Normalized selector mappings
└── SHA256SUMS                  # Artifact integrity checksums
```

---

## 2) CI Pipeline (Automated)

### Trigger Conditions
- **Push to:** `main`, `release/**`, `v*` tags
- **Manual:** `workflow_dispatch`

### Job Flow
1. **selfcheck** (always runs)
   - `npm run pipeline:predictive`
   - `npm run pipeline:observed || true` *(best-effort)*

2. **sign-manifest** (conditional)
   - **Guards:** Protected refs + secrets present
   - **Actions:**
     - `payrox:manifest:sign` → Embeds EIP-712 signature
     - `payrox:manifest:verify` → Validates against DISPATCHER_ADDR
     - Auto codehash diff (fails on drift)

---

## 3) Production Deployment Flow

### Pre-Deployment Verification
```bash
# Verify manifest integrity off-chain
npx hardhat payrox:manifest:selfcheck \
  --path split-output/manifest.root.json \
  --check-facets \
  --json
```

### Facet Staging (DeterministicChunkFactory)
```bash
# Dry run first
npx hardhat payrox:chunk:stage \
  --factory <FACTORY_ADDR> \
  --file ./build/facet.bin \
  --dry-run

# Stage for real
npx hardhat payrox:chunk:stage \
  --factory <FACTORY_ADDR> \
  --file ./build/facet.bin \
  --value 0.001

# Predict and verify chunk address
npx hardhat payrox:chunk:predict \
  --factory <FACTORY_ADDR> \
  --file ./build/facet.bin \
  --json
```

### Commit → Apply (ManifestDispatcher)
```bash
# 1. Commit plan (writes new root, starts activation delay)
npx ts-node scripts/commit-plan.ts \
  --plan split-output/deployment-plan.json

# 2. Wait configured delay period, then apply
npx ts-node scripts/apply-plan.ts \
  --plan split-output/deployment-plan.json
```

---

## 4) Guardian Gates (Automatic Failures)

### Critical Conditions (Pipeline Exits Non-Zero)
- ❌ **Codehash drift:** Predictive ≠ observed after normalization
- ❌ **Selector mismatch:** Route count ≠ leaf count after deduplication
- ❌ **EIP-170 violation:** Any facet ≥ 24,576 bytes
- ❌ **Size regression:** < 1KB headroom from EIP-170 limit
- ❌ **Test failures:** Unit tests, loupe compliance, manifest views
- ❌ **Gas regression:** >5% increase vs previous green baseline

### Escalation Triggers (Manual Review Required)
- ⚠️ **Leaf count drift:** Observed ≠ predictive after interface pruning
- ⚠️ **Empty facets:** Any routed facet has `EXTCODEHASH == keccak256("0x")`
- ⚠️ **Orchestration limits:** Gas caps or pause guards block planned calls
- ⚠️ **Signature failure:** EIP-712 verification fails against dispatcher

---

## 5) Emergency Controls

### Immediate Response (PayRoxProxyRouter)
```solidity
// Stop all routing immediately
router.setPaused(true);

// Surgical selector kill-switch
router.setForbiddenSelectors([0x12345678], true);

// One-way lock admin functions (except pause/forbid)
router.freeze();
```

### Governance Response (ManifestDispatcher)
```solidity
// Pause new commits/applies
dispatcher.pause();

// Resume after assessment
dispatcher.unpause();

// Emergency revert: commit previous root + apply after delay
```

### Rollback Procedure
1. Identify last known good `manifest.root.json`
2. Commit revert plan with previous root hash
3. Wait activation delay
4. Apply revert plan
5. Verify system state restored

---

## 6) Observability & Monitoring

### Real-Time Verification
```bash
# Off-chain parity check
npx hardhat payrox:manifest:selfcheck \
  --path split-output/manifest.root.json \
  --check-facets \
  --json

# Diff latest snapshots
npm run pipeline:diff
```

### Audit Trail
- **OrderedMerkle proofs:** `split-output/proofs.json`
- **Codehash snapshots:** `codehashes-{predictive,observed}-*.json`
- **Deployment plans:** `deployment-plan.json`, `orchestration-plan.json`
- **Integrity checksums:** `SHA256SUMS`

### Key Metrics to Monitor
- Merkle root consistency across environments
- Facet codehash stability
- Gas consumption trends
- Deployment success rates

---

## 7) Release Checklist

### Pre-Release (Development)
- [ ] All contracts compile without warnings
- [ ] Unit tests pass (100% success rate)
- [ ] Diamond loupe compliance verified
- [ ] Gas analysis within acceptable limits
- [ ] Predictive pipeline produces valid artifacts
- [ ] Local deployment successful (if applicable)

### Pre-Commit (CI)
- [ ] TypeScript build passes
- [ ] All tests pass in CI environment
- [ ] Manifest selfcheck passes
- [ ] Codehash diff shows no unexpected drift
- [ ] EIP-170 compliance verified
- [ ] No selector collisions detected

### Pre-Production (Staging)
- [ ] Staging deployment successful
- [ ] Observed artifacts match predictive
- [ ] End-to-end transaction tests pass
- [ ] Performance benchmarks within SLA
- [ ] Security audit recommendations addressed

### Production Release
- [ ] Manifest signed with production key
- [ ] Signature verification passes
- [ ] Activation delay configured appropriately
- [ ] Emergency controls tested and accessible
- [ ] Monitoring systems active
- [ ] Rollback plan documented and ready

### Post-Release
- [ ] Production deployment verified
- [ ] All metrics within normal ranges
- [ ] No unexpected events in logs
- [ ] Emergency controls remain accessible
- [ ] Documentation updated
- [ ] Team notified of successful deployment

---

## 8) Troubleshooting Guide

### Common Issues

**Q: Pipeline fails with "Missing deployed-addresses.json"**
```bash
# A: Run deployFacets first, or skip observed mode
npx ts-node --transpile-only tools/splitter/scripts/deployFacets.ts
```

**Q: Codehash diff shows unexpected drift**
```bash
# A: Check for compilation differences
npm run clean && npm run pipeline:predictive
```

**Q: Manifest signing fails**
```bash
# A: Verify environment variables are set
echo $SIGNER_KEY $DISPATCHER_ADDR $CHAIN_ID
```

**Q: EIP-170 compliance failure**
```bash
# A: Check facet sizes and optimize
npx hardhat compile --verbose
```

### Emergency Contacts
- **On-call Engineer:** [Insert contact]
- **Security Team:** [Insert contact]
- **DevOps Lead:** [Insert contact]

---

## 9) Additional Resources

- **Main Contracts:** `contracts/` directory
- **Pipeline Source:** `tools/splitter/offline-pipeline.ts`
- **Task Definitions:** `tasks/payrox*.ts`
- **CI Workflows:** `.github/workflows/`
- **Development Guide:** `docs/`

---

*Last Updated: August 2025*
*Document Version: 1.0*
