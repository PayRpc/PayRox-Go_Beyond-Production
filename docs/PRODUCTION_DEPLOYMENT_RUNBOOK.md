# PayRox Production Deployment Runbook

## Overview
This runbook provides step-by-step instructions for executing a production deployment of the PayRox diamond proxy system. It covers the complete process from pre-deployment validation through post-deployment verification.

## Prerequisites

### Environment Setup
- [ ] Hardhat environment configured with production settings
- [ ] Network configurations verified for target deployment
- [ ] Deployer wallet funded with sufficient gas
- [ ] Backup procedures tested and documented
- [ ] Rollback plan prepared and validated

### Validation Requirements (Must Pass)
- [ ] All unit tests passing (C/A/B/D requirements)
- [ ] Fork parity tests completed with >95% success rate
- [ ] Selector collision analysis clean
- [ ] ABI shape validation passed
- [ ] EIP-170 size compliance verified
- [ ] Merkle proof generation functional
- [ ] Deployment rehearsal successful

## Pre-Deployment Validation

### Step 1: Run Complete Validation Pipeline
```powershell
# Execute full validation suite
.\scripts\ci\production-cutover-ci.ps1 -Phase full -Network mainnet -FuzzRuns 1000

# Expected result: All phases PASS
# If any phase fails, address issues before proceeding
```

### Step 2: Verify Critical Test Results
```powershell
# Router reentrancy protection (C requirement)
npx hardhat test test/router.reentrancy.ts --network hardhat

# Dispatcher lifecycle (A requirement)
npx hardhat test test/manifest.dispatcher.test.ts --network hardhat

# Factory idempotency (B requirement)
npx hardhat test test/factory.deterministic.test.ts --network hardhat

# TypeScript deployment script (D requirement)
npx ts-node scripts/deploy/plan-dispatcher.ts
```

### Step 3: Final Code Review Checklist
- [ ] All contracts use Solidity 0.8.30 consistently
- [ ] viaIR: true enabled for stack depth management
- [ ] No hardcoded addresses or test-specific configurations
- [ ] Emergency pause mechanisms functional
- [ ] Ownership transfer procedures documented
- [ ] Gas limit optimizations applied

## Deployment Sequence

### Phase 1: Core Infrastructure Deployment

#### Deploy ManifestDispatcher
```bash
# 1. Deploy dispatcher contract
npx hardhat run scripts/deploy/01-deploy-dispatcher.ts --network [NETWORK]

# 2. Verify deployment
npx hardhat verify --network [NETWORK] [DISPATCHER_ADDRESS]

# 3. Record deployment details
echo "ManifestDispatcher: [DISPATCHER_ADDRESS]" >> deployment-log.txt
```

#### Deploy DeterministicChunkFactory
```bash
# 1. Deploy factory contract
npx hardhat run scripts/deploy/02-deploy-factory.ts --network [NETWORK]

# 2. Verify deployment
npx hardhat verify --network [NETWORK] [FACTORY_ADDRESS]

# 3. Record deployment details
echo "DeterministicChunkFactory: [FACTORY_ADDRESS]" >> deployment-log.txt
```

### Phase 2: PayRox Router Deployment

#### Deploy Main Router
```bash
# 1. Deploy router with initial configuration
npx hardhat run scripts/deploy/03-deploy-router.ts --network [NETWORK]

# 2. Verify deployment
npx hardhat verify --network [NETWORK] [ROUTER_ADDRESS] [CONSTRUCTOR_ARGS]

# 3. Test basic functionality
npx hardhat run scripts/validate/test-router-basic.ts --network [NETWORK]

# 4. Record deployment details
echo "PayRoxProxyRouter: [ROUTER_ADDRESS]" >> deployment-log.txt
```

### Phase 3: Facet Deployment and Registration

#### Generate Deployment Plan
```bash
# Generate dispatcher plan with all facets
npx ts-node scripts/deploy/plan-dispatcher.ts

# Verify plan structure
cat artifacts/dispatcher.plan.json | jq '.'

# Expected output: Valid JSON with facets, selectors, codehashes arrays
```

#### Deploy Individual Facets
```bash
# Deploy each facet according to the plan
for facet in $(cat artifacts/dispatcher.plan.json | jq -r '.facets[].name'); do
    echo "Deploying $facet..."
    npx hardhat run "scripts/deploy/facets/deploy-$facet.ts" --network [NETWORK]
done

# Verify all facet deployments
npx hardhat run scripts/validate/verify-facets.ts --network [NETWORK]
```

### Phase 4: Diamond Configuration

#### Stage Facet Integration
```bash
# 1. Stage the dispatcher plan
npx hardhat run scripts/deploy/04-stage-plan.ts --network [NETWORK]

# 2. Verify staging successful
npx hardhat run scripts/validate/verify-staging.ts --network [NETWORK]

# 3. Wait for activation delay (if configured)
echo "Waiting for activation delay..."
sleep [ACTIVATION_DELAY_SECONDS]
```

#### Apply Configuration
```bash
# 1. Apply staged configuration
npx hardhat run scripts/deploy/05-apply-plan.ts --network [NETWORK]

# 2. Verify diamond configuration
npx hardhat run scripts/validate/verify-diamond.ts --network [NETWORK]

# 3. Test all facet functions
npx hardhat run scripts/validate/test-all-functions.ts --network [NETWORK]
```

## Post-Deployment Validation

### Immediate Verification (Must Complete Within 1 Hour)

#### Function Verification
```bash
# Test all critical functions
npx hardhat run scripts/validate/test-critical-functions.ts --network [NETWORK]

# Expected tests:
# - owner() returns correct address
# - deployDeterministic() works with test bytecode
# - stage() accepts valid data
# - predict() returns expected addresses
# - Emergency functions (pause/freeze) accessible to owner only
```

#### Security Verification
```bash
# Test reentrancy protection
npx hardhat run scripts/validate/test-reentrancy.ts --network [NETWORK]

# Test access controls
npx hardhat run scripts/validate/test-access-controls.ts --network [NETWORK]

# Test emergency procedures
npx hardhat run scripts/validate/test-emergency.ts --network [NETWORK]
```

#### State Verification
```bash
# Verify dispatcher state
npx hardhat run scripts/validate/verify-dispatcher-state.ts --network [NETWORK]

# Verify factory state
npx hardhat run scripts/validate/verify-factory-state.ts --network [NETWORK]

# Verify router state
npx hardhat run scripts/validate/verify-router-state.ts --network [NETWORK]
```

### Extended Validation (Complete Within 24 Hours)

#### Integration Testing
```bash
# Run full integration test suite
npx hardhat test test/integration/ --network [NETWORK]

# Test with real transaction scenarios
npx hardhat run scripts/validate/integration-scenarios.ts --network [NETWORK]
```

#### Performance Monitoring
```bash
# Monitor gas usage patterns
npx hardhat run scripts/monitor/gas-usage.ts --network [NETWORK]

# Monitor event emissions
npx hardhat run scripts/monitor/event-monitor.ts --network [NETWORK]
```

#### Stress Testing
```bash
# Execute stress test scenarios
npx hardhat run scripts/validate/stress-test.ts --network [NETWORK]

# Monitor for any degradation or failures
```

## Emergency Procedures

### Immediate Pause Protocol
If critical issues are discovered:

```bash
# 1. Pause the router immediately
npx hardhat run scripts/emergency/pause-router.ts --network [NETWORK]

# 2. Notify stakeholders
./scripts/emergency/notify-stakeholders.sh

# 3. Begin investigation
./scripts/emergency/collect-diagnostics.sh
```

### Rollback Procedure
If deployment must be reverted:

```bash
# 1. Activate freeze mode
npx hardhat run scripts/emergency/freeze-system.ts --network [NETWORK]

# 2. Prepare rollback plan
npx hardhat run scripts/emergency/prepare-rollback.ts --network [NETWORK]

# 3. Execute rollback (requires multi-sig approval)
npx hardhat run scripts/emergency/execute-rollback.ts --network [NETWORK]
```

### Incident Response
```bash
# 1. Collect system state
npx hardhat run scripts/emergency/collect-state.ts --network [NETWORK]

# 2. Generate incident report
./scripts/emergency/generate-incident-report.sh

# 3. Coordinate response team
./scripts/emergency/coordinate-response.sh
```

## Success Criteria

### Deployment Success
- [ ] All contracts deployed and verified on block explorer
- [ ] All functions operational and returning expected results
- [ ] No revert conditions in normal operation paths
- [ ] Gas usage within expected parameters
- [ ] Event emissions matching expected patterns

### Security Success
- [ ] Reentrancy protection functional
- [ ] Access controls properly enforced
- [ ] Emergency procedures tested and working
- [ ] No unexpected permission escalations
- [ ] Ownership properly configured

### Performance Success
- [ ] Response times within acceptable ranges
- [ ] Gas costs optimized and predictable
- [ ] No memory or storage issues
- [ ] Concurrent access handling properly
- [ ] Load testing results acceptable

## Post-Deployment Monitoring

### Continuous Monitoring Setup
```bash
# Set up automated monitoring
./scripts/monitor/setup-monitoring.sh [ROUTER_ADDRESS] [NETWORK]

# Configure alerting
./scripts/monitor/setup-alerts.sh

# Start health checks
./scripts/monitor/start-health-checks.sh
```

### Daily Health Checks
- [ ] All functions responding correctly
- [ ] Gas usage patterns normal
- [ ] No unexpected reverts or errors
- [ ] Event patterns consistent
- [ ] Storage usage stable

### Weekly Reviews
- [ ] Performance metrics within targets
- [ ] Security audit findings addressed
- [ ] User feedback incorporated
- [ ] Optimization opportunities identified
- [ ] Documentation updated

## Troubleshooting

### Common Issues and Solutions

#### Compilation Errors
- **Stack too deep**: Ensure viaIR: true in hardhat.config.ts
- **Import errors**: Verify all contract paths use fully-qualified names
- **Version conflicts**: Confirm all contracts use Solidity 0.8.30

#### Deployment Failures
- **Gas estimation failures**: Increase gas limit or optimize contract size
- **Nonce issues**: Check deployer account nonce and adjust if needed
- **Network connectivity**: Verify RPC endpoint and retry

#### Verification Issues
- **Function not found**: Check selector generation and ABI consistency
- **State mismatch**: Verify deployment order and configuration steps
- **Access denied**: Confirm deployer has required permissions

### Support Contacts
- **Technical Lead**: [CONTACT_INFO]
- **Security Team**: [CONTACT_INFO]
- **Operations Team**: [CONTACT_INFO]
- **Emergency Hotline**: [CONTACT_INFO]

## Appendix

### Configuration Files
- `hardhat.config.ts`: Core build configuration
- `artifacts/dispatcher.plan.json`: Deployment plan
- `deployment-log.txt`: Deployment record
- `validation-report.md`: Pre-deployment validation results

### Script Locations
- Deployment: `scripts/deploy/`
- Validation: `scripts/validate/`
- Emergency: `scripts/emergency/`
- Monitoring: `scripts/monitor/`

### Documentation References
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Security Guidelines](docs/SECURITY.md)
- [Testing Strategy](docs/TESTING.md)
- [Monitoring Setup](docs/MONITORING.md)

---

**Document Version**: 1.0
**Last Updated**: $(Get-Date -Format 'yyyy-MM-dd')
**Reviewed By**: [REVIEWER_NAME]
**Approved By**: [APPROVER_NAME]
