// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import {CrossChainDeploymentLib} from "../contracts/utils/CrossChainDeploymentLib.sol";
import {DeterministicDeploymentManager} from "../contracts/manifest/DeterministicDeploymentManager.sol";
import {SaltViewFacet} from "../contracts/facets/SaltViewFacet.sol";

/**
 * @title CrossChainDeploymentTest
 * @notice Test the enhanced cross-chain deployment system
 */
contract CrossChainDeploymentTest is Test {
    using CrossChainDeploymentLib for CrossChainDeploymentLib.DeploymentManifest;
    
    // ══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ══════════════════════════════════════════════════════════════════════
    
    bytes32 constant MANIFEST_HASH = keccak256("test-manifest");
    string constant VERSION = "1.0.0";
    string constant COMPONENT_ID = "SaltViewFacet";
    address constant EIP2470 = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    
    // ══════════════════════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════════════════════
    
    DeterministicDeploymentManager manager;
    address mockDeployer;
    
    // ══════════════════════════════════════════════════════════════════════
    // SETUP
    // ══════════════════════════════════════════════════════════════════════
    
    function setUp() public {
        // Deploy a mock CREATE2 deployer that works like EIP-2470
        mockDeployer = _deployMockCreate2Deployer();
        
        // Deploy DeterministicDeploymentManager
        manager = new DeterministicDeploymentManager(
            MANIFEST_HASH,
            mockDeployer,
            false // not chain scoped by default
        );
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // TESTS: DEPLOYER PRESENCE DETECTION
    // ══════════════════════════════════════════════════════════════════════
    
    function test_checkDeployerPresence_ValidDeployer() public {
        (bool isPresent, uint256 codeSize) = manager.checkDeployerPresence(mockDeployer);
        
        assertTrue(isPresent, "Mock deployer should be present");
        assertGt(codeSize, 20, "Deployer should have significant code");
    }
    
    function test_checkDeployerPresence_InvalidDeployer() public {
        address nonExistentDeployer = address(0x1234);
        (bool isPresent, uint256 codeSize) = manager.checkDeployerPresence(nonExistentDeployer);
        
        assertFalse(isPresent, "Non-existent deployer should not be present");
        assertEq(codeSize, 0, "Non-existent deployer should have zero code");
    }
    
    function test_checkDefaultDeployerPresence() public {
        (bool isPresent, uint256 codeSize) = manager.checkDefaultDeployerPresence();
        
        assertTrue(isPresent, "Default deployer should be present");
        assertGt(codeSize, 0, "Default deployer should have code");
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // TESTS: SALT GENERATION
    // ══════════════════════════════════════════════════════════════════════
    
    function test_generateCrossChainSalt() public {
        bytes32 salt = manager.generateCrossChainSalt(COMPONENT_ID, VERSION);
        
        // Should be deterministic
        bytes32 salt2 = manager.generateCrossChainSalt(COMPONENT_ID, VERSION);
        assertEq(salt, salt2, "Salt should be deterministic");
        
        // Should match expected pattern: keccak256(manifestHash || componentId || version)
        bytes32 expected = keccak256(abi.encodePacked(MANIFEST_HASH, COMPONENT_ID, VERSION));
        assertEq(salt, expected, "Salt should match expected pattern");
    }
    
    function test_generateChainScopedSalt() public {
        uint256 chainId1 = 1;
        uint256 chainId2 = 137;
        
        bytes32 salt1 = manager.generateChainScopedSalt(COMPONENT_ID, VERSION, chainId1);
        bytes32 salt2 = manager.generateChainScopedSalt(COMPONENT_ID, VERSION, chainId2);
        
        // Different chains should produce different salts
        assertTrue(salt1 != salt2, "Different chains should produce different salts");
        
        // Should match expected pattern
        bytes32 expected1 = keccak256(abi.encodePacked(chainId1, MANIFEST_HASH, COMPONENT_ID, VERSION));
        assertEq(salt1, expected1, "Chain-scoped salt should match expected pattern");
    }
    
    function test_generateLocalChainSalt() public {
        bytes32 salt = manager.generateLocalChainSalt(COMPONENT_ID, VERSION);
        
        // Should match chain-scoped salt for current chain
        bytes32 expected = manager.generateChainScopedSalt(COMPONENT_ID, VERSION, block.chainid);
        assertEq(salt, expected, "Local chain salt should match current chain scoped salt");
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // TESTS: ADDRESS PREDICTION
    // ══════════════════════════════════════════════════════════════════════
    
    function test_predictComponentAddress() public {
        // Get SaltViewFacet creation code
        bytes memory initCode = type(SaltViewFacet).creationCode;
        
        (address predicted, bytes32 salt, bytes32 initCodeHash) = manager.predictComponentAddress(
            COMPONENT_ID,
            VERSION,
            initCode,
            false // not chain scoped
        );
        
        // Verify salt matches expected pattern
        bytes32 expectedSalt = keccak256(abi.encodePacked(MANIFEST_HASH, COMPONENT_ID, VERSION));
        assertEq(salt, expectedSalt, "Salt should match expected pattern");
        
        // Verify init code hash
        bytes32 expectedInitCodeHash = keccak256(initCode);
        assertEq(initCodeHash, expectedInitCodeHash, "Init code hash should be correct");
        
        // Verify address is valid
        assertTrue(predicted != address(0), "Predicted address should not be zero");
    }
    
    function test_predictComponentAddress_ChainScoped() public {
        bytes memory initCode = type(SaltViewFacet).creationCode;
        
        (address predicted1, bytes32 salt1,) = manager.predictComponentAddress(
            COMPONENT_ID,
            VERSION,
            initCode,
            true // chain scoped
        );
        
        // Change chain ID and predict again
        vm.chainId(137); // Polygon
        (address predicted2, bytes32 salt2,) = manager.predictComponentAddress(
            COMPONENT_ID,
            VERSION,
            initCode,
            true // chain scoped  
        );
        
        // Should be different addresses and salts
        assertTrue(predicted1 != predicted2, "Chain-scoped addresses should differ");
        assertTrue(salt1 != salt2, "Chain-scoped salts should differ");
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // TESTS: COMPONENT DEPLOYMENT
    // ══════════════════════════════════════════════════════════════════════
    
    function test_deployComponent() public {
        bytes memory initCode = type(SaltViewFacet).creationCode;
        
        // Predict address first
        (address predicted,,) = manager.predictComponentAddress(
            COMPONENT_ID,
            VERSION,
            initCode,
            false
        );
        
        // Deploy component
        address deployed = manager.deployComponent(
            COMPONENT_ID,
            VERSION,
            initCode,
            false
        );
        
        // Verify deployment matches prediction
        assertEq(deployed, predicted, "Deployed address should match prediction");
        
        // Verify contract was actually deployed
        assertGt(deployed.code.length, 0, "Deployed contract should have code");
        
        // Verify component is recorded in manifest
        address recorded = manager.getComponentAddress(COMPONENT_ID);
        assertEq(recorded, deployed, "Component should be recorded in manifest");
    }
    
    function test_deployComponent_Idempotent() public {
        bytes memory initCode = type(SaltViewFacet).creationCode;
        
        // Deploy component first time
        address deployed1 = manager.deployComponent(
            COMPONENT_ID,
            VERSION,
            initCode,
            false
        );
        
        // Deploy same component again - should return same address
        address deployed2 = manager.deployComponent(
            COMPONENT_ID,
            VERSION,
            initCode,
            false
        );
        
        assertEq(deployed1, deployed2, "Redeployment should be idempotent");
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // TESTS: MANIFEST MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════
    
    function test_freezeManifest() public {
        // Deploy a component first
        bytes memory initCode = type(SaltViewFacet).creationCode;
        address deployed = manager.deployComponent(COMPONENT_ID, VERSION, initCode, false);
        
        // Verify not frozen initially
        (bool frozen1,,) = manager.getManifestFreezeStatus();
        assertFalse(frozen1, "Manifest should not be frozen initially");
        
        // Freeze manifest
        string[] memory componentIds = new string[](1);
        componentIds[0] = COMPONENT_ID;
        address[] memory addresses = new address[](1);
        addresses[0] = deployed;
        
        manager.freezeManifest(componentIds, addresses);
        
        // Verify frozen
        (bool frozen2, uint256 timestamp, bytes32 linkMapHash) = manager.getManifestFreezeStatus();
        assertTrue(frozen2, "Manifest should be frozen");
        assertEq(timestamp, block.timestamp, "Freeze timestamp should be current time");
        assertTrue(linkMapHash != bytes32(0), "Link map hash should be set");
    }
    
    function test_freezeManifest_PreventsDeployment() public {
        // Deploy and freeze
        bytes memory initCode = type(SaltViewFacet).creationCode;
        address deployed = manager.deployComponent(COMPONENT_ID, VERSION, initCode, false);
        
        string[] memory componentIds = new string[](1);
        componentIds[0] = COMPONENT_ID;
        address[] memory addresses = new address[](1);
        addresses[0] = deployed;
        manager.freezeManifest(componentIds, addresses);
        
        // Try to deploy another component - should fail
        vm.expectRevert("Manifest is frozen");
        manager.deployComponent("AnotherComponent", VERSION, initCode, false);
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // TESTS: CONSISTENCY VALIDATION
    // ══════════════════════════════════════════════════════════════════════
    
    function test_validateConsistency() public {
        bytes memory initCode = type(SaltViewFacet).creationCode;
        
        // Predict address
        (address predicted,,) = manager.predictComponentAddress(
            COMPONENT_ID,
            VERSION,
            initCode,
            false
        );
        
        // Validate consistency
        bool isConsistent = manager.validateConsistency(
            COMPONENT_ID,
            VERSION,
            initCode,
            false,
            predicted
        );
        
        assertTrue(isConsistent, "Prediction should be consistent");
        
        // Test with wrong address
        bool isInconsistent = manager.validateConsistency(
            COMPONENT_ID,
            VERSION,
            initCode,
            false,
            address(0x1234)
        );
        
        assertFalse(isInconsistent, "Wrong address should be inconsistent");
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // TESTS: CHAIN SUPPORT MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════
    
    function test_addChainSupport() public {
        uint256 newChainId = 999;
        
        // Verify not supported initially
        assertFalse(manager.isChainSupported(newChainId), "Chain should not be supported initially");
        
        // Add support
        manager.addChainSupport(newChainId);
        
        // Verify now supported
        assertTrue(manager.isChainSupported(newChainId), "Chain should be supported after adding");
    }
    
    function test_isChainSupported_CurrentChain() public {
        // Current chain should be supported by default
        assertTrue(manager.isChainSupported(block.chainid), "Current chain should be supported by default");
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════
    
    function _deployMockCreate2Deployer() internal returns (address deployer) {
        // Deploy a simple CREATE2 deployer for testing
        bytes memory deployerCode = abi.encodePacked(
            // Simple CREATE2 deployer that mimics EIP-2470 behavior
            hex"60806040526004361061002d5760003560e01c80634af63f0214610032578063c2d75bf61461016f575b600080fd5b34801561003e57600080fd5b5061015d6004803603606081101561005557600080fd5b810190808035906020019064010000000081111561007257600080fd5b82018360208201111561008457600080fd5b8035906020019184600183028401116401000000008311171561000657600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f820116905080830192505050505050509192919290803590602001906401000000008111156100e957600080fd5b8201836020820111156100fb57600080fd5b8035906020019184600183028401116401000000008311171561011d57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600081840152601f19601f820116905080830192505050505050509192919290803590602001909291905050506101d7565b60405161016c919061026b565b60405180910390f35b34801561017b57600080fd5b506101856102d2565b6040516101829190610286565b60405180910390f35b60008084848460405160200161019f939291906102a1565b6040516020818303038152906040528051906020012060001c90506000828251602084016000f594505050505092915050565b6040518060200160405280600181526020017f000000000000000000000000000000000000000000000000000000000000000081525081565b61022881610268565b82525050565b600061023982610268565b9050919050565b600061024b82610268565b9050919050565b61025b8161022e565b82525050565b61026a81610240565b82525050565b60006020820190506102886000830184610252565b92915050565b600060208201905061029c6000830184610261565b92915050565b60006102ae8286610240565b91506102ba8285610240565b91506102c68284610240565b9150819050949350505050565b600160405190808252806020026020018201604052801561030357816020015b6102f0610240565b8152602001906001900390816102e25790505b509050600081600081518110151561031757fe5b90602001906020020181815250508091505090565b600061033782610240565b915050919050565b600060405190808252806020026020018201604052801561036f5781602001602082028038833980820191505090505b50905090565b600061038082610240565b915050919050565b6000610393826103d7565b9050919050565b60006103a58261040c565b9050919050565b60006103b7826103ec565b9050919050565b60006103c982610421565b9050919050565b60006103db82610436565b9050919050565b60006103ed8261044b565b9050919050565b60006103ff82610387565b9050919050565b600061041182610460565b9050919050565b600061042382610475565b9050919050565b6000610435826104aa565b9050919050565b60006104478261048a565b9050919050565b6000610459826104bf565b9050919050565b600061046b826104d4565b9050919050565b6000610477826104e9565b9050919050565b6000610489826104fe565b9050919050565b600061049b82610513565b9050919050565b60006104ad82610528565b9050919050565b60006104bf8261053d565b9050919050565b60006104d182610552567"
        );
        
        address addr;
        assembly {
            addr := create2(0, add(deployerCode, 0x20), mload(deployerCode), 0)
        }
        require(addr != address(0), "Failed to deploy mock CREATE2 deployer");
        
        return addr;
    }
}
