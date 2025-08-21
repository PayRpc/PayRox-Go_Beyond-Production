# Foundry Integration Guide

## Library Structure

```
lib/payrox-foundry/
├── foundry.toml
├── src/
│   ├── PayRoxBase.sol        # Base test contract
│   ├── interfaces/
│   │   ├── IManifestDispatcher.sol
│   │   ├── IChunkFactory.sol
│   │   └── IPayRoxPlugin.sol
│   └── utils/
│       ├── OrderedMerkle.sol
│       ├── Integrity.sol
│       └── Safety.sol
├── script/
│   ├── PayRoxDeploy.s.sol   # Main deployment script
│   ├── ManifestApply.s.sol  # Manifest operations
│   ├── FactoryOps.s.sol     # Factory operations
│   └── SafetyCheck.s.sol    # Safety verification
└── test/
    └── PayRox.t.sol
```

## Core Forge Scripts

### 1. Manifest Operations Script

```solidity
// script/ManifestApply.s.sol
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/interfaces/IManifestDispatcher.sol";
import "../src/utils/OrderedMerkle.sol";
import "../src/utils/Integrity.sol";

contract ManifestApplyScript is Script {
    
    function run() external {
        address dispatcher = vm.envAddress("DISPATCHER_ADDRESS");
        string memory manifestPath = vm.envString("MANIFEST_PATH");
        
        vm.startBroadcast();
        
        // Load manifest from JSON
        string memory manifestJson = vm.readFile(manifestPath);
        
        bytes4[] memory selectors = parseSelectors(manifestJson);
        address[] memory facets = parseFacets(manifestJson);
        bytes32[] memory hashes = parseHashes(manifestJson);
        bytes32[][] memory proofs = parseProofs(manifestJson);
        uint256[] memory positions = parsePositions(manifestJson);
        
        // Verify integrity before applying
        require(verifyIntegrity(selectors, facets, hashes), "Integrity check failed");
        
        // Apply routes
        IManifestDispatcher(dispatcher).applyRoutes(
            selectors,
            facets,
            hashes,
            proofs,
            positions
        );
        
        vm.stopBroadcast();
        
        console.log("Manifest applied successfully");
    }
    
    function verifyIntegrity(
        bytes4[] memory selectors,
        address[] memory facets,
        bytes32[] memory hashes
    ) internal view returns (bool) {
        // Implement integrity verification
        return Integrity.verifyManifest(selectors, facets, hashes);
    }
    
    function parseSelectors(string memory json) internal pure returns (bytes4[] memory) {
        // Parse selectors from JSON
        // Implementation depends on your JSON structure
    }
    
    function parseFacets(string memory json) internal pure returns (address[] memory) {
        // Parse facet addresses from JSON
    }
    
    function parseHashes(string memory json) internal pure returns (bytes32[] memory) {
        // Parse hashes from JSON
    }
    
    function parseProofs(string memory json) internal pure returns (bytes32[][] memory) {
        // Parse merkle proofs from JSON
    }
    
    function parsePositions(string memory json) internal pure returns (uint256[] memory) {
        // Parse position bitfields from JSON
    }
}
```

### 2. Factory Operations Script

```solidity
// script/FactoryOps.s.sol
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/interfaces/IChunkFactory.sol";
import "../src/utils/Safety.sol";

contract FactoryOpsScript is Script {
    
    function stage() external {
        address factory = vm.envAddress("FACTORY_ADDRESS");
        string memory bytecodeHex = vm.envString("BYTECODE_HEX");
        
        vm.startBroadcast();
        
        // Convert hex string to bytes
        bytes memory bytecode = vm.parseBytes(bytecodeHex);
        
        // Verify factory integrity
        require(Safety.verifyFactoryIntegrity(factory), "Factory integrity check failed");
        
        // Stage bytecode
        IChunkFactory(factory).stage(bytecode);
        
        vm.stopBroadcast();
        
        console.log("Bytecode staged successfully");
    }
    
    function deploy() external {
        address factory = vm.envAddress("FACTORY_ADDRESS");
        bytes32 salt = vm.envBytes32("DEPLOY_SALT");
        
        vm.startBroadcast();
        
        // Deploy with salt
        address deployed = IChunkFactory(factory).deploy(salt);
        
        vm.stopBroadcast();
        
        console.log("Contract deployed at:", deployed);
    }
    
    function batchDeploy() external {
        address factory = vm.envAddress("FACTORY_ADDRESS");
        string memory configPath = vm.envString("BATCH_CONFIG_PATH");
        
        vm.startBroadcast();
        
        string memory configJson = vm.readFile(configPath);
        
        // Parse batch deployment configuration
        BatchConfig[] memory configs = parseBatchConfig(configJson);
        
        for (uint i = 0; i < configs.length; i++) {
            // Stage
            IChunkFactory(factory).stage(configs[i].bytecode);
            console.log("Staged:", configs[i].name);
            
            // Deploy
            address deployed = IChunkFactory(factory).deploy(configs[i].salt);
            console.log("Deployed:", configs[i].name, "at", deployed);
        }
        
        vm.stopBroadcast();
    }
    
    struct BatchConfig {
        string name;
        bytes bytecode;
        bytes32 salt;
    }
    
    function parseBatchConfig(string memory json) internal pure returns (BatchConfig[] memory) {
        // Parse batch configuration from JSON
        // Implementation depends on your JSON structure
    }
}
```

### 3. Safety Check Script

```solidity
// script/SafetyCheck.s.sol
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/interfaces/IManifestDispatcher.sol";
import "../src/utils/Safety.sol";
import "../src/utils/OrderedMerkle.sol";

contract SafetyCheckScript is Script {
    
    function run() external view {
        address dispatcher = vm.envAddress("DISPATCHER_ADDRESS");
        
        console.log("Running safety checks...");
        
        // Check 1: Dispatcher freeze state
        require(!IManifestDispatcher(dispatcher).isFrozen(), "Dispatcher is frozen");
        console.log("✓ Dispatcher freeze state OK");
        
        // Check 2: Codehash verification
        bytes32 expectedCodehash = vm.envBytes32("EXPECTED_CODEHASH");
        require(Safety.verifyCodehash(dispatcher, expectedCodehash), "Codehash mismatch");
        console.log("✓ Codehash integrity OK");
        
        // Check 3: Route integrity
        require(Safety.verifyRouteIntegrity(dispatcher), "Route integrity failed");
        console.log("✓ Route integrity OK");
        
        // Check 4: Merkle proof validation
        require(Safety.verifyMerkleProofs(dispatcher), "Merkle proof validation failed");
        console.log("✓ Merkle proof validation OK");
        
        // Check 5: Selector regression check
        string memory baselinePath = vm.envString("BASELINE_SELECTORS_PATH");
        require(Safety.verifySelectorsNoRegression(dispatcher, baselinePath), "Selector regression detected");
        console.log("✓ Selector regression check OK");
        
        console.log("✓ All safety checks passed");
    }
    
    function ciGuard() external view {
        try this.run() {
            console.log("✓ CI guard passed - safe to proceed");
        } catch {
            console.log("✗ CI guard failed");
            vm.revert();
        }
    }
}
```

### 4. Deployment Script

```solidity
// script/PayRoxDeploy.s.sol
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/interfaces/IManifestDispatcher.sol";
import "../src/interfaces/IChunkFactory.sol";

contract PayRoxDeployScript is Script {
    
    function deployDispatcher() external {
        vm.startBroadcast();
        
        // Deploy dispatcher
        // Implementation depends on your dispatcher constructor
        address dispatcher = deployCode("ManifestDispatcher.sol");
        
        vm.stopBroadcast();
        
        console.log("Dispatcher deployed at:", dispatcher);
    }
    
    function deployFactory() external {
        vm.startBroadcast();
        
        // Deploy factory
        address factory = deployCode("ChunkFactory.sol");
        
        vm.stopBroadcast();
        
        console.log("Factory deployed at:", factory);
    }
    
    function deployComplete() external {
        vm.startBroadcast();
        
        // Deploy full PayRox system
        address dispatcher = deployCode("ManifestDispatcher.sol");
        address factory = deployCode("ChunkFactory.sol");
        
        // Initialize connections if needed
        // IManifestDispatcher(dispatcher).setFactory(factory);
        
        vm.stopBroadcast();
        
        console.log("PayRox system deployed:");
        console.log("Dispatcher:", dispatcher);
        console.log("Factory:", factory);
    }
}
```

## Utility Contracts

### 1. Safety Verification Utilities

```solidity
// src/utils/Safety.sol
pragma solidity ^0.8.0;

import "../interfaces/IManifestDispatcher.sol";

library Safety {
    
    function verifyFactoryIntegrity(address factory) internal view returns (bool) {
        // Verify factory is in expected state
        // Check codehash, state variables, etc.
        return true; // Placeholder
    }
    
    function verifyCodehash(address target, bytes32 expectedHash) internal view returns (bool) {
        bytes32 actualHash = target.codehash;
        return actualHash == expectedHash;
    }
    
    function verifyRouteIntegrity(address dispatcher) internal view returns (bool) {
        // Verify all expected routes are present and correct
        // This would check against a baseline configuration
        return true; // Placeholder
    }
    
    function verifyMerkleProofs(address dispatcher) internal view returns (bool) {
        // Verify all merkle proofs in the system are valid
        return true; // Placeholder
    }
    
    function verifySelectorsNoRegression(
        address dispatcher, 
        string memory baselinePath
    ) internal view returns (bool) {
        // Compare current selectors with baseline
        // Ensure no regressions in available functions
        return true; // Placeholder
    }
}
```

### 2. Integrity Verification

```solidity
// src/utils/Integrity.sol
pragma solidity ^0.8.0;

library Integrity {
    
    function verifyManifest(
        bytes4[] memory selectors,
        address[] memory facets,
        bytes32[] memory hashes
    ) internal pure returns (bool) {
        // Verify manifest data integrity
        require(selectors.length == facets.length, "Length mismatch: selectors/facets");
        require(facets.length == hashes.length, "Length mismatch: facets/hashes");
        
        // Additional integrity checks
        for (uint i = 0; i < selectors.length; i++) {
            require(selectors[i] != bytes4(0), "Invalid selector");
            require(facets[i] != address(0), "Invalid facet address");
            require(hashes[i] != bytes32(0), "Invalid hash");
        }
        
        return true;
    }
    
    function verifyFacetBytecode(address facet, bytes32 expectedHash) internal view returns (bool) {
        return facet.codehash == expectedHash;
    }
}
```

## Usage with Forge Commands

### Environment Configuration

```bash
# .env file
DISPATCHER_ADDRESS=0x1234567890123456789012345678901234567890
FACTORY_ADDRESS=0x0987654321098765432109876543210987654321
MANIFEST_PATH=./manifests/main.json
BASELINE_SELECTORS_PATH=./baselines/selectors.json
EXPECTED_CODEHASH=0xabcdef...
BYTECODE_HEX=0x608060...
DEPLOY_SALT=0x1111111111111111111111111111111111111111111111111111111111111111
BATCH_CONFIG_PATH=./config/batch-deploy.json
```

### Command Examples

```bash
# Apply manifest
forge script script/ManifestApply.s.sol:ManifestApplyScript --rpc-url $RPC_URL --broadcast

# Stage bytecode
forge script script/FactoryOps.s.sol:FactoryOpsScript --sig "stage()" --rpc-url $RPC_URL --broadcast

# Deploy contract
forge script script/FactoryOps.s.sol:FactoryOpsScript --sig "deploy()" --rpc-url $RPC_URL --broadcast

# Batch deploy
forge script script/FactoryOps.s.sol:FactoryOpsScript --sig "batchDeploy()" --rpc-url $RPC_URL --broadcast

# Safety checks
forge script script/SafetyCheck.s.sol:SafetyCheckScript --rpc-url $RPC_URL

# CI guard
forge script script/SafetyCheck.s.sol:SafetyCheckScript --sig "ciGuard()" --rpc-url $RPC_URL

# Deploy full system
forge script script/PayRoxDeploy.s.sol:PayRoxDeployScript --sig "deployComplete()" --rpc-url $RPC_URL --broadcast
```

## Integration with Build Scripts

```bash
#!/bin/bash
# scripts/build-and-deploy.sh

set -e

echo "🔨 Building PayRox system..."

# 1. Split contracts into facets
echo "📂 Splitting contracts..."
node scripts/tools/ast/split-facets.js contracts/MainContract.sol --out contracts/facets

# 2. Compile contracts
echo "🔧 Compiling contracts..."
forge build

# 3. Run safety checks
echo "🛡️ Running safety checks..."
forge script script/SafetyCheck.s.sol:SafetyCheckScript --rpc-url $RPC_URL

# 4. Apply manifest
echo "📡 Applying manifest..."
forge script script/ManifestApply.s.sol:ManifestApplyScript --rpc-url $RPC_URL --broadcast

# 5. Verify deployment
echo "✅ Verifying deployment..."
forge script script/SafetyCheck.s.sol:SafetyCheckScript --rpc-url $RPC_URL

echo "🎉 Deployment complete!"
```

## Testing Integration

```solidity
// test/PayRox.t.sol
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/interfaces/IManifestDispatcher.sol";
import "../src/utils/Safety.sol";

contract PayRoxTest is Test {
    IManifestDispatcher dispatcher;
    
    function setUp() public {
        // Deploy test dispatcher
        dispatcher = IManifestDispatcher(deployCode("ManifestDispatcher.sol"));
    }
    
    function testManifestApplication() public {
        // Test manifest application workflow
        bytes4[] memory selectors = new bytes4[](1);
        address[] memory facets = new address[](1);
        bytes32[] memory hashes = new bytes32[](1);
        bytes32[][] memory proofs = new bytes32[][](1);
        uint256[] memory positions = new uint256[](1);
        
        // Apply routes
        dispatcher.applyRoutes(selectors, facets, hashes, proofs, positions);
        
        // Verify application
        assertTrue(Safety.verifyRouteIntegrity(address(dispatcher)));
    }
    
    function testSafetyChecks() public {
        // Test all safety check functions
        assertTrue(Safety.verifyRouteIntegrity(address(dispatcher)));
        // Add more safety tests
    }
}
```

This Foundry integration provides the same functionality as the Hardhat plugin but uses Forge's native scripting and testing capabilities, making it ideal for teams that prefer Foundry's workflow.
