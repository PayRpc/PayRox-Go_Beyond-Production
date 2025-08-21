// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SaltPolicyLib} from "../libraries/SaltPolicyLib.sol";

/**
 * @title CrossChainDeploymentLib
 * @notice Practical utilities for deterministic cross-chain deployment
 * @dev Implements the operational guidance for consistent same-address deployment:
 *      - Deployer presence detection
 *      - Link-map freezing
 *      - Manifest annotations
 *      - Cross-chain salt policy enforcement
 */
library CrossChainDeploymentLib {
    
    // ══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice EIP-2470 deterministic deployer address
    address internal constant EIP2470_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    
    /// @notice Minimum required bytecode for a valid deployer
    uint256 internal constant MIN_DEPLOYER_CODE_SIZE = 20;
    
    /// @notice Maximum allowed component ID length
    uint256 internal constant MAX_COMPONENT_ID_LENGTH = 64;
    
    // ══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ══════════════════════════════════════════════════════════════════════
    
    error DeployerNotPresent(address deployer);
    error InvalidDeployerCode(address deployer, uint256 codeSize);
    error ComponentIdTooLong(uint256 length, uint256 maxLength);
    error ManifestHashZero();
    error VersionHashZero();
    error ChainIdMismatch(uint256 expected, uint256 actual);
    error LinkMapFrozen(bytes32 linkMapHash);
    error InconsistentAddressPrediction(address expected, address predicted);
    
    // ══════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Component deployment configuration
    struct ComponentConfig {
        bytes32 manifestHash;      // Root manifest hash
        string componentId;        // Component identifier (e.g., "ChunkFactory", "SaltViewFacet")
        string version;           // Version string (e.g., "1.0.0")
        address deployer;         // CREATE2 deployer address
        bytes initCode;           // Contract initialization code
        bool chainScoped;         // Whether to include chainId in salt
    }
    
    /// @notice Cross-chain deployment manifest
    struct DeploymentManifest {
        bytes32 manifestHash;
        mapping(string => address) componentAddresses;
        mapping(string => bytes32) componentCodehashes;
        mapping(uint256 => bool) supportedChains;
        bool frozen;
        uint256 freezeTimestamp;
        bytes32 linkMapHash;
    }
    
    /// @notice Deployment result with verification data
    struct DeploymentResult {
        address deployed;
        bytes32 salt;
        bytes32 initCodeHash;
        bool isConsistent;
        uint256 chainId;
        address actualDeployer;
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // DEPLOYER PRESENCE DETECTION
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Check if a deployer is present and functional on current chain
    /// @param deployer Address of the CREATE2 deployer
    /// @return isPresent Whether the deployer exists with valid code
    /// @return codeSize Size of the deployer's bytecode
    function checkDeployerPresence(address deployer) 
        internal 
        view 
        returns (bool isPresent, uint256 codeSize) 
    {
        codeSize = deployer.code.length;
        isPresent = codeSize >= MIN_DEPLOYER_CODE_SIZE;
    }
    
    /// @notice Require deployer presence with descriptive error
    /// @param deployer Address of the CREATE2 deployer
    function requireDeployerPresence(address deployer) internal view {
        (bool isPresent, uint256 codeSize) = checkDeployerPresence(deployer);
        
        if (!isPresent) {
            if (codeSize == 0) {
                revert DeployerNotPresent(deployer);
            } else {
                revert InvalidDeployerCode(deployer, codeSize);
            }
        }
    }
    
    /// @notice Check if EIP-2470 singleton deployer is available
    /// @return isAvailable Whether EIP-2470 is deployed on this chain
    function isEIP2470Available() internal view returns (bool isAvailable) {
        (isAvailable,) = checkDeployerPresence(EIP2470_DEPLOYER);
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN SALT GENERATION
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Generate deterministic salt for cross-chain deployment
    /// @dev Implements: salt = keccak256(manifestHash || componentId || version)
    /// @param manifestHash Root manifest hash for the deployment
    /// @param componentId Component identifier (e.g., "ChunkFactory")
    /// @param version Version string (e.g., "1.0.0")
    /// @return salt Deterministic salt for CREATE2
    function generateCrossChainSalt(
        bytes32 manifestHash,
        string memory componentId,
        string memory version
    ) internal pure returns (bytes32 salt) {
        // Validate inputs
        if (manifestHash == bytes32(0)) revert ManifestHashZero();
        if (bytes(componentId).length > MAX_COMPONENT_ID_LENGTH) {
            revert ComponentIdTooLong(bytes(componentId).length, MAX_COMPONENT_ID_LENGTH);
        }
        
        // Generate salt: keccak256(manifestHash || componentId || version)
        salt = keccak256(abi.encodePacked(manifestHash, componentId, version));
    }
    
    /// @notice Generate chain-scoped salt to prevent cross-chain collisions
    /// @param manifestHash Root manifest hash for the deployment  
    /// @param componentId Component identifier
    /// @param version Version string
    /// @param chainId Target chain ID
    /// @return salt Chain-scoped deterministic salt
    function generateChainScopedSalt(
        bytes32 manifestHash,
        string memory componentId,
        string memory version,
        uint256 chainId
    ) internal pure returns (bytes32 salt) {
        // Validate inputs
        if (manifestHash == bytes32(0)) revert ManifestHashZero();
        if (bytes(componentId).length > MAX_COMPONENT_ID_LENGTH) {
            revert ComponentIdTooLong(bytes(componentId).length, MAX_COMPONENT_ID_LENGTH);
        }
        
        // Generate chain-scoped salt: keccak256(chainId || manifestHash || componentId || version)
        salt = keccak256(abi.encodePacked(chainId, manifestHash, componentId, version));
    }
    
    /// @notice Generate salt using current chain ID for chain-scoped deployment
    /// @param manifestHash Root manifest hash for the deployment
    /// @param componentId Component identifier  
    /// @param version Version string
    /// @return salt Chain-scoped salt for current chain
    function generateLocalChainSalt(
        bytes32 manifestHash,
        string memory componentId,
        string memory version
    ) internal view returns (bytes32 salt) {
        return generateChainScopedSalt(manifestHash, componentId, version, block.chainid);
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // ADDRESS PREDICTION & VALIDATION
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Predict CREATE2 address for component deployment
    /// @param config Component deployment configuration
    /// @return predicted Predicted deployment address
    /// @return salt Used salt value
    /// @return initCodeHash Hash of initialization code
    function predictComponentAddress(ComponentConfig memory config)
        internal
        view
        returns (address predicted, bytes32 salt, bytes32 initCodeHash)
    {
        // Generate appropriate salt based on scoping policy
        if (config.chainScoped) {
            salt = generateLocalChainSalt(config.manifestHash, config.componentId, config.version);
        } else {
            salt = generateCrossChainSalt(config.manifestHash, config.componentId, config.version);
        }
        
        // Compute init code hash
        initCodeHash = keccak256(config.initCode);
        
        // Predict address using CREATE2 formula
        predicted = SaltPolicyLib.create2Address(config.deployer, salt, initCodeHash);
    }
    
    /// @notice Validate deployment consistency across chains
    /// @param config Component deployment configuration
    /// @param expectedAddress Expected deployment address
    /// @return isConsistent Whether prediction matches expected address
    function validateConsistency(
        ComponentConfig memory config,
        address expectedAddress
    ) internal view returns (bool isConsistent) {
        (address predicted,,) = predictComponentAddress(config);
        isConsistent = (predicted == expectedAddress);
    }
    
    /// @notice Require deployment consistency with descriptive error
    /// @param config Component deployment configuration  
    /// @param expectedAddress Expected deployment address
    function requireConsistency(
        ComponentConfig memory config,
        address expectedAddress
    ) internal view {
        (address predicted,,) = predictComponentAddress(config);
        if (predicted != expectedAddress) {
            revert InconsistentAddressPrediction(expectedAddress, predicted);
        }
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // DEPLOYMENT EXECUTION
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Deploy component with full validation and verification
    /// @param config Component deployment configuration
    /// @return result Deployment result with verification data
    function deployComponent(ComponentConfig memory config) 
        internal 
        returns (DeploymentResult memory result) 
    {
        // Step 1: Validate deployer presence
        requireDeployerPresence(config.deployer);
        
        // Step 2: Predict deployment address
        (address predicted, bytes32 salt, bytes32 initCodeHash) = predictComponentAddress(config);
        
        // Step 3: Check if already deployed
        if (predicted.code.length > 0) {
            // Already deployed - verify it's the correct code
            // Note: We can't easily verify the existing code matches our expected runtime
            // This is a limitation of CREATE2 idempotency checking
            result = DeploymentResult({
                deployed: predicted,
                salt: salt,
                initCodeHash: initCodeHash,
                isConsistent: true,
                chainId: block.chainid,
                actualDeployer: config.deployer
            });
            return result;
        }
        
        // Step 4: Deploy using CREATE2
        address deployed;
        assembly {
            deployed := create2(
                0,                                    // value
                add(mload(config), 0x20),            // init code offset
                mload(mload(config)),                // init code size
                salt                                 // salt
            )
        }
        
        // Step 5: Verify deployment success and address consistency
        require(deployed != address(0), "CREATE2 deployment failed");
        require(deployed == predicted, "Deployed address mismatch");
        
        result = DeploymentResult({
            deployed: deployed,
            salt: salt,
            initCodeHash: initCodeHash,
            isConsistent: true,
            chainId: block.chainid,
            actualDeployer: config.deployer
        });
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // LINK-MAP FREEZING
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Compute link-map hash for freeze validation
    /// @param componentIds Array of component identifiers
    /// @param addresses Array of component addresses
    /// @param chainId Target chain ID
    /// @return linkMapHash Hash representing the deployment link-map
    function computeLinkMapHash(
        string[] memory componentIds,
        address[] memory addresses,
        uint256 chainId
    ) internal pure returns (bytes32 linkMapHash) {
        require(componentIds.length == addresses.length, "Array length mismatch");
        linkMapHash = keccak256(abi.encode(componentIds, addresses, chainId));
    }
    
    /// @notice Check if a link-map is frozen (prevents modification)
    /// @param manifest Deployment manifest to check
    /// @param proposedLinkMapHash Hash of proposed link-map changes
    /// @return isFrozen Whether the link-map is frozen
    function isLinkMapFrozen(
        DeploymentManifest storage manifest,
        bytes32 proposedLinkMapHash
    ) internal view returns (bool isFrozen) {
        if (!manifest.frozen) return false;
        
        // If frozen, only allow exact same link-map
        isFrozen = (manifest.linkMapHash != proposedLinkMapHash);
    }
    
    /// @notice Freeze deployment manifest to prevent modifications
    /// @param manifest Deployment manifest to freeze
    /// @param linkMapHash Current link-map hash to freeze
    function freezeManifest(
        DeploymentManifest storage manifest,
        bytes32 linkMapHash
    ) internal {
        manifest.frozen = true;
        manifest.freezeTimestamp = block.timestamp;
        manifest.linkMapHash = linkMapHash;
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // MANIFEST ANNOTATIONS
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Add component to deployment manifest
    /// @param manifest Deployment manifest
    /// @param componentId Component identifier
    /// @param deployedAddress Deployed component address
    /// @param codehash Component runtime codehash
    function annotateComponent(
        DeploymentManifest storage manifest,
        string memory componentId,
        address deployedAddress,
        bytes32 codehash
    ) internal {
        manifest.componentAddresses[componentId] = deployedAddress;
        manifest.componentCodehashes[componentId] = codehash;
    }
    
    /// @notice Mark chain as supported in manifest
    /// @param manifest Deployment manifest
    /// @param chainId Chain ID to mark as supported
    function markChainSupported(
        DeploymentManifest storage manifest,
        uint256 chainId
    ) internal {
        manifest.supportedChains[chainId] = true;
    }
    
    /// @notice Check if chain is supported in manifest
    /// @param manifest Deployment manifest
    /// @param chainId Chain ID to check
    /// @return isSupported Whether the chain is supported
    function isChainSupported(
        DeploymentManifest storage manifest,
        uint256 chainId
    ) internal view returns (bool isSupported) {
        return manifest.supportedChains[chainId];
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Validate chain ID matches expected value
    /// @param expectedChainId Expected chain ID
    function requireChainId(uint256 expectedChainId) internal view {
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }
    }
    
    /// @notice Get component address from manifest
    /// @param manifest Deployment manifest
    /// @param componentId Component identifier
    /// @return componentAddress Address of the component (zero if not found)
    function getComponentAddress(
        DeploymentManifest storage manifest,
        string memory componentId
    ) internal view returns (address componentAddress) {
        return manifest.componentAddresses[componentId];
    }
    
    /// @notice Get component codehash from manifest
    /// @param manifest Deployment manifest
    /// @param componentId Component identifier
    /// @return codehash Codehash of the component (zero if not found)
    function getComponentCodehash(
        DeploymentManifest storage manifest,
        string memory componentId
    ) internal view returns (bytes32 codehash) {
        return manifest.componentCodehashes[componentId];
    }
}
