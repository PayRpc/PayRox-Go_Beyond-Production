# Enhanced Cross-Chain Deployment System

> **Practical guidance implemented**: "Same address across chains requires same deployer, same init-code, same salt… if you rely on your ChunkFactory as the CREATE2 deployer, that factory must exist at the same address on every chain… Salt policy: chain-agnostic or chain-scoped; cross-chain example salt = keccak256(manifestHash || componentId || version)."

## Overview

This enhanced deployment system implements operational best practices for deterministic cross-chain deployment, addressing the common foot-guns that break determinism:

✅ **Deployer presence detection** - Validates that CREATE2 deployers exist before attempting deployment  
✅ **Link-map freezing** - Prevents modification of deployment manifests after finalization  
✅ **Manifest annotations** - Comprehensive tracking of component addresses and integrity  
✅ **Cross-chain salt policy** - Deterministic salt generation with chain-agnostic or chain-scoped options  

## Core Components

### 1. CrossChainDeploymentLib (`contracts/utils/CrossChainDeploymentLib.sol`)

Core library implementing the deterministic deployment logic:

```solidity
// Generate cross-chain deterministic salt
bytes32 salt = CrossChainDeploymentLib.generateCrossChainSalt(
    manifestHash,    // Root manifest hash
    "ChunkFactory",  // Component ID
    "1.0.0"         // Version
);
// Result: keccak256(manifestHash || componentId || version)

// Deploy with full validation
CrossChainDeploymentLib.ComponentConfig memory config = CrossChainDeploymentLib.ComponentConfig({
    manifestHash: manifestHash,
    componentId: "ChunkFactory",
    version: "1.0.0",
    deployer: deployerAddress,
    initCode: factoryBytecode,
    chainScoped: false  // true for chain-specific addresses
});

CrossChainDeploymentLib.DeploymentResult memory result = 
    CrossChainDeploymentLib.deployComponent(config);
```

**Key Features:**
- **Deployer Presence Detection**: Validates CREATE2 deployer availability before deployment
- **Salt Generation**: Implements `keccak256(manifestHash || componentId || version)` pattern
- **Chain Scoping**: Optional chain-specific salts to prevent cross-chain collisions
- **Address Prediction**: Accurate CREATE2 address prediction with validation
- **Consistency Validation**: Ensures deployed addresses match predictions

### 2. DeterministicDeploymentManager (`contracts/manifest/DeterministicDeploymentManager.sol`)

High-level deployment manager with operational safety:

```solidity
// Deploy DeterministicDeploymentManager
DeterministicDeploymentManager manager = new DeterministicDeploymentManager(
    manifestHash,    // Root manifest hash
    deployerAddress, // CREATE2 deployer (EIP-2470 default)
    false           // chainScoped policy
);

// Deploy component through manager
address deployed = manager.deployComponent(
    "ChunkFactory",  // Component ID
    "1.0.0",        // Version
    initCode,       // Contract bytecode
    false           // Use cross-chain salt
);

// Freeze manifest to prevent modifications
string[] memory componentIds = ["ChunkFactory", "SaltViewFacet"];
address[] memory addresses = [factoryAddr, saltViewAddr];
manager.freezeManifest(componentIds, addresses);
```

**Key Features:**
- **Role-Based Access Control**: Separate roles for deployment and manifest management
- **Link-Map Freezing**: Prevents modification after deployment finalization
- **Manifest Annotations**: Tracks component addresses and codehashes
- **Chain Support Management**: Marks supported chains in deployment manifest
- **Consistency Validation**: Built-in validation of address predictions

### 3. Enhanced Deployment Script (`scripts/deploy/enhanced-cross-chain-deploy.ts`)

Production-ready deployment orchestrator:

```bash
# Environment Configuration
export MANIFEST_HASH="0x1234...abcdef"
export DEPLOYMENT_VERSION="1.0.0" 
export CHAIN_SCOPED="false"
export DEPLOYER_ADDRESS="0x4e59b44847b379578588920cA78FbF26c0B4956C"  # EIP-2470
export FREEZE_AFTER_DEPLOY="true"

# Run deployment
npx hardhat run scripts/deploy/enhanced-cross-chain-deploy.ts --network mainnet
```

**Features:**
- **Multi-Chain Support**: Deploys to multiple chains with consistency validation
- **Deployer Validation**: Checks EIP-2470 presence before deployment
- **Component Management**: Handles complex component dependencies
- **Manifest Generation**: Creates comprehensive deployment manifests
- **Consistency Analysis**: Cross-chain address consistency validation

### 4. Cross-Chain Validator (`scripts/validate/cross-chain-validator.ts`)

Post-deployment validation and monitoring:

```bash
# Environment Configuration
export MANIFEST_PATH="./manifests/deployment-manifest-1.0.0.json"
export CHECK_CHAINS="1,137,42161,10,8453"  # Ethereum, Polygon, Arbitrum, Optimism, Base
export STRICT_MODE="true"
export OUTPUT_PATH="./manifests/validation-report.json"

# Validate deployment
npx hardhat run scripts/validate/cross-chain-validator.ts
```

**Validation Checks:**
- **Deployer Presence**: Validates CREATE2 deployer on all target chains
- **Address Consistency**: Ensures same addresses across chains
- **Code Integrity**: Verifies deployed bytecode matches expectations
- **Link-Map Integrity**: Validates frozen manifests
- **Cross-Chain Analysis**: Comprehensive consistency reporting

## Salt Policy Implementation

### Cross-Chain Salt (Default)
For consistent addresses across chains:
```solidity
salt = keccak256(manifestHash || componentId || version)
```

**Use Cases:**
- Factory contracts that need same address everywhere
- Registry contracts with cross-chain lookups
- Universal access points

### Chain-Scoped Salt (Optional)
For chain-specific deployments:
```solidity
salt = keccak256(chainId || manifestHash || componentId || version)
```

**Use Cases:**
- Chain-specific configuration contracts
- Preventing accidental cross-chain collisions
- Staged deployment strategies

## Operational Best Practices

### 1. Deployer Presence Detection

**Before Any Deployment:**
```solidity
// Check if EIP-2470 is available
bool isAvailable = CrossChainDeploymentLib.isEIP2470Available();
if (!isAvailable) {
    // Deploy EIP-2470 singleton first
    // Or use alternative CREATE2 deployer
}

// Validate specific deployer
CrossChainDeploymentLib.requireDeployerPresence(deployerAddress);
```

**Benefits:**
- Prevents deployment failures due to missing deployers
- Enables graceful fallback to alternative deployers
- Provides clear error messages for debugging

### 2. Link-Map Freezing

**After Successful Deployment:**
```solidity
// Freeze to prevent modifications
manager.freezeManifest(componentIds, addresses);

// Verify freeze status
(bool frozen, uint256 timestamp, bytes32 linkMapHash) = 
    manager.getManifestFreezeStatus();
```

**Benefits:**
- Prevents accidental modification of production deployments
- Creates immutable deployment records
- Enables safe cross-chain referencing

### 3. Manifest Annotations

**Component Tracking:**
```solidity
// Automatic annotation during deployment
manager.deployComponent(componentId, version, initCode, chainScoped);

// Query deployed components
address componentAddr = manager.getComponentAddress("ChunkFactory");
bytes32 codehash = manager.getComponentCodehash("ChunkFactory");
```

**Benefits:**
- Comprehensive deployment records
- Easy component lookup
- Integrity validation capabilities

## Integration Guide

### Step 1: Deploy Infrastructure

```typescript
// 1. Deploy DeterministicDeploymentManager
const manager = await deployDeploymentManager({
  manifestHash: "0x1234...abcdef",
  defaultDeployer: "0x4e59b44847b379578588920cA78FbF26c0B4956C", // EIP-2470
  chainScoped: false
});

// 2. Verify deployer presence
const [isPresent, codeSize] = await manager.checkDefaultDeployerPresence();
console.log(`Deployer present: ${isPresent}, size: ${codeSize} bytes`);
```

### Step 2: Deploy Components

```typescript
// Deploy factory component
const factoryAddr = await manager.deployComponent(
  "ChunkFactory",
  "1.0.0", 
  factoryBytecode,
  false // cross-chain salt
);

// Deploy utility components
const saltViewAddr = await manager.deployComponent(
  "SaltViewFacet",
  "1.0.0",
  saltViewBytecode, 
  false
);
```

### Step 3: Freeze Deployment

```typescript
// Freeze manifest to prevent modifications
await manager.freezeManifest(
  ["ChunkFactory", "SaltViewFacet"],
  [factoryAddr, saltViewAddr]
);
```

### Step 4: Validate Cross-Chain

```typescript
// Run validation across chains
const validator = new CrossChainDeploymentValidator({
  manifestPath: "./manifests/deployment-manifest-1.0.0.json",
  checkChains: [1, 137, 42161, 10, 8453],
  strictMode: true
});

const report = await validator.validate();
console.log(`Valid: ${report.overallValid}`);
```

## Common Patterns

### Pattern 1: Universal Factory Deployment

For factories that need the same address across all chains:

```solidity
// Use cross-chain salt for consistent addresses
bytes32 salt = generateCrossChainSalt(manifestHash, "ChunkFactory", "1.0.0");

// Deploy on each chain with same parameters
address factory = deployComponent({
    componentId: "ChunkFactory",
    version: "1.0.0", 
    initCode: factoryBytecode,
    chainScoped: false  // Same address everywhere
});
```

### Pattern 2: Chain-Specific Configuration

For contracts that need different addresses per chain:

```solidity
// Use chain-scoped salt for unique addresses
bytes32 salt = generateChainScopedSalt(manifestHash, "ChainConfig", "1.0.0", chainId);

// Deploy with chain-specific parameters
address config = deployComponent({
    componentId: "ChainConfig",
    version: "1.0.0",
    initCode: configBytecode, 
    chainScoped: true  // Different address per chain
});
```

### Pattern 3: Staged Deployment

For rolling out updates across chains:

```solidity
// Phase 1: Deploy to test chains
deployToChains([11155111, 80002], false); // Sepolia, Amoy

// Phase 2: Validate and deploy to production
validateConsistency();
deployToChains([1, 137, 42161], false); // Mainnet, Polygon, Arbitrum

// Phase 3: Freeze after confirmation
freezeManifest();
```

## Error Handling

### Common Issues and Solutions

**Issue: Deployer Not Present**
```
Error: DeployerNotPresent(0x4e59b44847b379578588920cA78FbF26c0B4956C)
Solution: Deploy EIP-2470 singleton or use alternative deployer
```

**Issue: Address Mismatch**
```
Error: InconsistentAddressPrediction(expected: 0x123..., predicted: 0x456...)
Solution: Verify manifestHash, componentId, version, and initCode consistency
```

**Issue: Manifest Frozen**
```
Error: ManifestFrozen(linkMapHash: 0x789...)
Solution: Use new manifest hash or deploy with updated manager
```

## Security Considerations

### 1. Deployer Security
- Use well-audited CREATE2 deployers (EIP-2470 recommended)
- Validate deployer bytecode before use
- Have fallback deployer strategies

### 2. Salt Generation
- Use strong, deterministic salt generation
- Include all relevant parameters in salt
- Avoid predictable salts that could be front-run

### 3. Manifest Integrity
- Freeze manifests after deployment completion
- Use strong manifest hashes (keccak256)
- Validate component codehashes after deployment

### 4. Access Control
- Use role-based access for deployment operations
- Separate deployment and manifest management roles
- Implement time locks for critical operations

## Testing

### Unit Tests
```bash
# Test deployment library
npm run test:unit -- test/CrossChainDeploymentLib.test.ts

# Test deployment manager
npm run test:unit -- test/DeterministicDeploymentManager.test.ts
```

### Integration Tests
```bash
# Test cross-chain deployment
npm run test:integration -- test/cross-chain-deployment.test.ts

# Test validation system
npm run test:integration -- test/deployment-validation.test.ts
```

### End-to-End Tests
```bash
# Deploy and validate full system
npm run test:e2e -- test/full-deployment.test.ts
```

## Monitoring and Maintenance

### 1. Deployment Health Checks
- Monitor deployer presence across chains
- Validate component integrity periodically
- Check for deployment drift

### 2. Cross-Chain Consistency
- Regular validation runs
- Automated consistency alerts
- Drift detection and reporting

### 3. Upgrade Management
- Version-controlled deployments
- Staged rollout procedures
- Rollback capabilities

## Conclusion

This enhanced deployment system provides production-ready tools for deterministic cross-chain deployment, implementing the key operational guidance:

✅ **Same deployer, same init-code, same salt** - Enforced through validation  
✅ **Deployer presence detection** - Prevents deployment failures  
✅ **Link-map freezing** - Protects production deployments  
✅ **Manifest annotations** - Comprehensive deployment tracking  
✅ **Cross-chain salt policy** - `keccak256(manifestHash || componentId || version)`  

The system avoids common foot-guns that break determinism and provides clear operational procedures for safe, consistent cross-chain deployment.
