# PayRox Security Framework

This directory contains comprehensive security tools, auditing frameworks, and testing infrastructure for the PayRox protocol.

## Quick Start

```bash
# Run preflight safety checks
npm run preflight -- --dispatcher 0x... --factory 0x...

# Quick health check
npm run health -- --dispatcher 0x...

# Run property tests
DISPATCHER=0x... FACTORY=0x... forge test --match-contract PayRoxInvariants -vv

# Run Merkle property tests
forge test --match-contract OrderedMerkleProperties -vv
```

## Framework Components

### 1. [PayRox Auditor Playbook v2](./PAYROX_PLAYBOOK.md)
Comprehensive security playbook with:
- Issue classification templates
- Hardhat preflight tasks
- Foundry invariant tests
- Static analysis guidelines
- CI/CD integration patterns

### 2. Hardhat Preflight Tasks
Located in `/tasks/payrox-preflight.ts`:
- **`payrox:preflight`**: Complete safety battery for dispatcher + factory
- **`payrox:health`**: Quick system health check

### 3. Foundry Property Tests

#### Core Invariants (`/test/invariants/PayRoxInvariants.t.sol`)
- **System Integrity**: Factory integrity must always hold
- **Codehash Gating**: Route codehashes must match EXTCODEHASH
- **Frozen State**: No mutations when system is frozen
- **Epoch Monotonicity**: Time progression consistency
- **Loupe Consistency**: Diamond interface data consistency

#### Merkle Properties (`/test/properties/OrderedMerkleProperties.t.sol`)
- **Equivalence**: Bitfield vs bool array verification
- **High Bit Masking**: Extra bits beyond proof length ignored
- **Sibling Flipping**: Changing proof elements breaks verification
- **Position Bounds**: Position bits beyond proof length ignored
- **Edge Cases**: Empty proof and concrete examples

## Usage Patterns

### Development Workflow
```bash
# 1. Before deployment
npm run preflight -- --dispatcher $DISPATCHER --factory $FACTORY

# 2. After contract changes
forge test --match-contract PayRoxInvariants -vv

# 3. Merkle verification changes
forge test --match-contract OrderedMerkleProperties -vv

# 4. Quick health monitoring
npm run health -- --dispatcher $DISPATCHER
```

### CI/CD Integration
```yaml
# Example GitHub Actions
- name: PayRox Preflight
  run: |
    npm run preflight -- --dispatcher ${{ env.DISPATCHER }} --factory ${{ env.FACTORY }}
    
- name: Property Tests
  run: |
    DISPATCHER=${{ env.DISPATCHER }} FACTORY=${{ env.FACTORY }} forge test --match-contract PayRoxInvariants
```

### Audit Preparation
```bash
# Generate audit materials
npm run audit:prep
npm run audit:template
npm run audit:chatgpt

# Run static analysis
slither . --checklist --markdown-root $PWD > audit-slither.md

# Property testing
forge test --match-contract Properties -vv > audit-properties.log
```

## Security Checklist

### Pre-Deployment
- [ ] Run `npm run preflight` successfully
- [ ] All invariant tests pass
- [ ] Static analysis clean (Slither, Mythril)
- [ ] Manual review of critical paths
- [ ] Upgrade/migration path documented

### Post-Deployment
- [ ] Verify system integrity
- [ ] Check route codehash consistency  
- [ ] Monitor epoch progression
- [ ] Validate freeze mechanisms
- [ ] Test emergency procedures

### Ongoing Monitoring
- [ ] Regular health checks
- [ ] Invariant test regression
- [ ] Dependency vulnerability scans
- [ ] Gas optimization reviews
- [ ] Access control audits

## Framework Extension

### Adding New Invariants
1. Add test to `PayRoxInvariants.t.sol`
2. Follow naming: `invariant_DescriptiveName()`
3. Include failure messages with context
4. Test with various system states

### Custom Property Tests
1. Create new contract in `/test/properties/`
2. Import relevant contracts and interfaces
3. Use fuzzing with appropriate bounds
4. Document property being tested

### Integration with Tools
- **Slither**: Use provided configuration
- **Mythril**: Target specific components
- **Echidna**: Property-based fuzzing
- **Foundry**: Invariant and property testing
- **Hardhat**: Task automation and preflight

## Best Practices

### Test Design
- Use meaningful bounds in fuzzing (`vm.assume`)
- Test edge cases explicitly
- Include regression tests for known issues
- Document property intent clearly

### Security Reviews
- Focus on core invariants first
- Test upgrade scenarios thoroughly
- Validate access control mechanisms
- Check for reentrancy vectors

### Monitoring
- Automate health checks
- Set up alerts for integrity failures
- Monitor gas usage patterns
- Track system state changes

## Troubleshooting

### Common Issues
- **Preflight fails**: Check contract addresses and network
- **Invariant failures**: Review recent changes and system state
- **Property test reverts**: Adjust bounds and assumptions
- **Gas issues**: Reduce test scope or use sampling

### Debug Commands
```bash
# Verbose preflight
npm run preflight -- --dispatcher $ADDR --factory $ADDR --verbose

# Single invariant test
forge test --match-test invariant_SystemIntegrityHolds -vvv

# Property test with traces
forge test --match-contract OrderedMerkleProperties -vvv
```

---

For more details, see the [PayRox Auditor Playbook v2](./PAYROX_PLAYBOOK.md) and individual test files.
