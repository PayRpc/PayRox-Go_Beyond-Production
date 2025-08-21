# Integration Validation System

![PayRox Logo](icons/payrox-logo.svg)

## Overview

The PayRox integration validator (`tools/validate-integration.ts`) provides end-to-end protocol consistency checks to ensure all components speak the same language.

## What It Validates

![Code Document](icons/code-document.svg) **Facet Policy Compliance**

![Validation Document](icons/validation-document.svg) **Manifest-ABI Parity**  

![Network Integration](icons/network-integration.svg) **System Integration**

### 1. **Facet Policy Compliance**
- ✅ No Diamond Loupe functions in business facets (centralized in DiamondLoupeFacet)
- ✅ No ERC-165 functions except in ERC165Facet (centralized policy)
- ✅ EIP-170 size limits (24,576 bytes max per facet)
- ✅ Interface artifacts properly filtered from validation

### 2. **Manifest-ABI Parity**
- ✅ Every facet in manifest exists in compiled artifacts
- ✅ Selector lists match between manifest and compiled ABIs
- ✅ Warning for compiled functions missing from manifest

### 3. **Selector Hashing Consistency**
- ✅ No SHA-256 usage for selector generation (keccak256 only)
- ✅ Checks tooling scripts for consistent hash algorithms
- ✅ Enforces PayRox's keccak256(toUtf8Bytes(signature)) standard

### 4. **Salt Policy Validation**
- ✅ TypeScript uses `ethers.solidityPacked` + `ethers.keccak256`
- ✅ Solidity uses `SaltPolicyLib.sol` (when present)
- ✅ Ensures deterministic deployment consistency

### 5. **Router Security Checks**
- ✅ PayRoxProxyRouter has codehash pinning capabilities
- ✅ INIT_SALT constant present for front-run protection
- ✅ initSalt validation logic in initializer

## Usage

### Local Development
```bash
npm run check:wire
```

### In CI/CD
```yaml
- name: 🔗 Wiring / manifest parity check
  run: npm run check:wire
```

### Integration Testing
```bash
npx hardhat test --grep "wiring"
```

## Error Categories

### ❌ **Problems** (Fail Build)
- Facets exposing banned Diamond Loupe functions
- Facets exceeding EIP-170 size limits
- Manifest-ABI selector mismatches
- SHA-256 usage in selector generation
- Missing security features in router

### ⚠️ **Warnings** (Review Required)
- Compiled selectors missing from manifest
- Missing salt policy libraries
- Potential hash algorithm inconsistencies
- Missing optional security features

## Protocol Guarantees

When this validator passes, you have confidence that:

1. **Diamond Architecture**: Clean separation of concerns
2. **Upgradeability**: Manifest-driven deployment consistency
3. **Security**: Router hardening and codehash pinning
4. **Determinism**: Consistent salt policies across languages
5. **Standards**: EIP-170 compliance and ERC-165 centralization

## Files Created

- `tools/validate-integration.ts` - Main validator logic
- `test/integration/wiring.test.ts` - Integration test suite
- `package.json` - Added `check:wire` script and glob dependency

## Next Steps

Add to CI pipeline:
```yaml
steps:
  - run: npm ci
  - run: npx hardhat compile
  - run: npm run check:wire  # Integration validation
  - run: npx hardhat test
```

This provides a single red/green signal that contracts, facets, manifests, routers, and scripts maintain protocol coherence.
