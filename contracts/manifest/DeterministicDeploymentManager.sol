// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CrossChainDeploymentLib} from "../utils/CrossChainDeploymentLib.sol";
import {SaltPolicyLib} from "../libraries/SaltPolicyLib.sol";
import {PayRoxAccessControlStorage as ACS} from "../libraries/PayRoxAccessControlStorage.sol";

/**
 * @title DeterministicDeploymentManager
 * @notice Manages cross-chain deterministic deployments with operational safety
 * @dev Implements practical guidance for same-address deployment across chains:
 *      "Same address across chains requires same deployer, same init-code, same salt…
 *       if you rely on your ChunkFactory as the CREATE2 deployer, that factory must
 *       exist at the same address on every chain… Salt policy: chain-agnostic or 
 *       chain-scoped; cross-chain example salt = keccak256(manifestHash || componentId || version)."
 */
contract DeterministicDeploymentManager {
    using CrossChainDeploymentLib for CrossChainDeploymentLib.DeploymentManifest;
    
    // ══════════════════════════════════════════════════════════════════════
    // CONSTANTS & STORAGE
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Role for deployment operations
    bytes32 public constant DEPLOYER_ROLE = keccak256("DEPLOYER_ROLE");
    
    /// @notice Role for manifest management
    bytes32 public constant MANIFEST_ADMIN_ROLE = keccak256("MANIFEST_ADMIN_ROLE");
    
    /// @notice Current deployment manifest
    CrossChainDeploymentLib.DeploymentManifest internal manifest;
    
    /// @notice Default deployer address (EIP-2470 or custom)
    address public defaultDeployer;
    
    /// @notice Whether to use chain-scoped salts by default
    bool public defaultChainScoped;
    
    // ══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ══════════════════════════════════════════════════════════════════════
    
    event ComponentDeployed(
        string indexed componentId,
        address indexed deployed,
        bytes32 salt,
        uint256 chainId,
        address deployer
    );
    
    event ManifestFrozen(
        bytes32 indexed manifestHash,
        bytes32 linkMapHash,
        uint256 timestamp
    );
    
    event DeployerPresenceChecked(
        address indexed deployer,
        bool isPresent,
        uint256 codeSize
    );
    
    event ChainSupportAdded(
        uint256 indexed chainId,
        bytes32 indexed manifestHash
    );
    
    event DefaultDeployerUpdated(
        address indexed oldDeployer,
        address indexed newDeployer
    );
    
    // ══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ══════════════════════════════════════════════════════════════════════
    
    constructor(
        bytes32 _manifestHash,
        address _defaultDeployer,
        bool _defaultChainScoped
    ) {
        // Initialize manifest
        manifest.manifestHash = _manifestHash;
        
        // Set default deployer (EIP-2470 if zero address)
        defaultDeployer = _defaultDeployer != address(0) 
            ? _defaultDeployer 
            : CrossChainDeploymentLib.EIP2470_DEPLOYER;
        
        defaultChainScoped = _defaultChainScoped;
        
        // Set up access control
        ACS.layout().roles[ACS.DEFAULT_ADMIN_ROLE][msg.sender] = true;
        ACS.layout().roles[DEPLOYER_ROLE][msg.sender] = true;
        ACS.layout().roles[MANIFEST_ADMIN_ROLE][msg.sender] = true;
        
        // Mark current chain as supported
        manifest.markChainSupported(block.chainid);
        
        emit ChainSupportAdded(block.chainid, _manifestHash);
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ══════════════════════════════════════════════════════════════════════
    
    modifier onlyRole(bytes32 role) {
        require(ACS.layout().roles[role][msg.sender], "AccessControl: missing role");
        _;
    }
    
    modifier notFrozen() {
        require(!manifest.frozen, "Manifest is frozen");
        _;
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // DEPLOYER PRESENCE MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Check if default deployer is present on current chain
    /// @return isPresent Whether deployer exists with valid code
    /// @return codeSize Size of deployer's bytecode
    function checkDefaultDeployerPresence() 
        external 
        view 
        returns (bool isPresent, uint256 codeSize) 
    {
        return CrossChainDeploymentLib.checkDeployerPresence(defaultDeployer);
    }
    
    /// @notice Check if a specific deployer is present
    /// @param deployer Address to check
    /// @return isPresent Whether deployer exists with valid code
    /// @return codeSize Size of deployer's bytecode
    function checkDeployerPresence(address deployer) 
        external 
        view 
        returns (bool isPresent, uint256 codeSize) 
    {
        return CrossChainDeploymentLib.checkDeployerPresence(deployer);
    }
    
    /// @notice Check EIP-2470 singleton deployer availability
    /// @return isAvailable Whether EIP-2470 is deployed on this chain
    function isEIP2470Available() external view returns (bool isAvailable) {
        return CrossChainDeploymentLib.isEIP2470Available();
    }
    
    /// @notice Update default deployer address
    /// @param newDeployer New default deployer address
    function setDefaultDeployer(address newDeployer) 
        external 
        onlyRole(MANIFEST_ADMIN_ROLE) 
        notFrozen 
    {
        // Validate new deployer presence
        CrossChainDeploymentLib.requireDeployerPresence(newDeployer);
        
        address oldDeployer = defaultDeployer;
        defaultDeployer = newDeployer;
        
        emit DefaultDeployerUpdated(oldDeployer, newDeployer);
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // COMPONENT DEPLOYMENT
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Deploy a component with deterministic address
    /// @param componentId Component identifier (e.g., "ChunkFactory", "SaltViewFacet")
    /// @param version Version string (e.g., "1.0.0")
    /// @param initCode Contract initialization bytecode
    /// @param useChainScoped Whether to use chain-scoped salt
    /// @return deployed Address of deployed component
    function deployComponent(
        string calldata componentId,
        string calldata version,
        bytes calldata initCode,
        bool useChainScoped
    ) external onlyRole(DEPLOYER_ROLE) returns (address deployed) {
        return _deployComponent(componentId, version, initCode, useChainScoped, defaultDeployer);
    }
    
    /// @notice Deploy component with specific deployer
    /// @param componentId Component identifier
    /// @param version Version string
    /// @param initCode Contract initialization bytecode
    /// @param useChainScoped Whether to use chain-scoped salt
    /// @param deployer Specific deployer address to use
    /// @return deployed Address of deployed component
    function deployComponentWithDeployer(
        string calldata componentId,
        string calldata version,
        bytes calldata initCode,
        bool useChainScoped,
        address deployer
    ) external onlyRole(DEPLOYER_ROLE) returns (address deployed) {
        return _deployComponent(componentId, version, initCode, useChainScoped, deployer);
    }
    
    /// @notice Internal deployment logic
    function _deployComponent(
        string calldata componentId,
        string calldata version,
        bytes calldata initCode,
        bool useChainScoped,
        address deployer
    ) internal returns (address deployed) {
        // Create deployment configuration
        CrossChainDeploymentLib.ComponentConfig memory config = CrossChainDeploymentLib.ComponentConfig({
            manifestHash: manifest.manifestHash,
            componentId: componentId,
            version: version,
            deployer: deployer,
            initCode: initCode,
            chainScoped: useChainScoped
        });
        
        // Deploy component
        CrossChainDeploymentLib.DeploymentResult memory result = 
            CrossChainDeploymentLib.deployComponent(config);
        
        // Annotate manifest
        manifest.annotateComponent(
            componentId,
            result.deployed,
            result.deployed.codehash
        );
        
        deployed = result.deployed;
        
        emit ComponentDeployed(
            componentId,
            deployed,
            result.salt,
            result.chainId,
            result.actualDeployer
        );
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // ADDRESS PREDICTION
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Predict component deployment address
    /// @param componentId Component identifier
    /// @param version Version string
    /// @param initCode Contract initialization bytecode
    /// @param useChainScoped Whether to use chain-scoped salt
    /// @return predicted Predicted deployment address
    /// @return salt Salt that would be used
    /// @return initCodeHash Hash of initialization code
    function predictComponentAddress(
        string calldata componentId,
        string calldata version,
        bytes calldata initCode,
        bool useChainScoped
    ) external view returns (address predicted, bytes32 salt, bytes32 initCodeHash) {
        return _predictComponentAddress(componentId, version, initCode, useChainScoped, defaultDeployer);
    }
    
    /// @notice Predict component address with specific deployer
    /// @param componentId Component identifier
    /// @param version Version string
    /// @param initCode Contract initialization bytecode
    /// @param useChainScoped Whether to use chain-scoped salt
    /// @param deployer Specific deployer address
    /// @return predicted Predicted deployment address
    /// @return salt Salt that would be used
    /// @return initCodeHash Hash of initialization code
    function predictComponentAddressWithDeployer(
        string calldata componentId,
        string calldata version,
        bytes calldata initCode,
        bool useChainScoped,
        address deployer
    ) external view returns (address predicted, bytes32 salt, bytes32 initCodeHash) {
        return _predictComponentAddress(componentId, version, initCode, useChainScoped, deployer);
    }
    
    /// @notice Internal prediction logic
    function _predictComponentAddress(
        string calldata componentId,
        string calldata version,
        bytes calldata initCode,
        bool useChainScoped,
        address deployer
    ) internal view returns (address predicted, bytes32 salt, bytes32 initCodeHash) {
        CrossChainDeploymentLib.ComponentConfig memory config = CrossChainDeploymentLib.ComponentConfig({
            manifestHash: manifest.manifestHash,
            componentId: componentId,
            version: version,
            deployer: deployer,
            initCode: initCode,
            chainScoped: useChainScoped
        });
        
        return CrossChainDeploymentLib.predictComponentAddress(config);
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // SALT GENERATION (PUBLIC UTILITIES)
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Generate cross-chain salt for component
    /// @dev Implements: salt = keccak256(manifestHash || componentId || version)
    /// @param componentId Component identifier
    /// @param version Version string
    /// @return salt Cross-chain deterministic salt
    function generateCrossChainSalt(
        string calldata componentId,
        string calldata version
    ) external view returns (bytes32 salt) {
        return CrossChainDeploymentLib.generateCrossChainSalt(
            manifest.manifestHash,
            componentId,
            version
        );
    }
    
    /// @notice Generate chain-scoped salt for component
    /// @param componentId Component identifier
    /// @param version Version string
    /// @param chainId Target chain ID
    /// @return salt Chain-scoped deterministic salt
    function generateChainScopedSalt(
        string calldata componentId,
        string calldata version,
        uint256 chainId
    ) external view returns (bytes32 salt) {
        return CrossChainDeploymentLib.generateChainScopedSalt(
            manifest.manifestHash,
            componentId,
            version,
            chainId
        );
    }
    
    /// @notice Generate local chain salt for component
    /// @param componentId Component identifier
    /// @param version Version string
    /// @return salt Local chain-scoped salt
    function generateLocalChainSalt(
        string calldata componentId,
        string calldata version
    ) external view returns (bytes32 salt) {
        return CrossChainDeploymentLib.generateLocalChainSalt(
            manifest.manifestHash,
            componentId,
            version
        );
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // LINK-MAP FREEZING
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Freeze deployment manifest to prevent modifications
    /// @param componentIds Array of component identifiers in link-map
    /// @param addresses Array of component addresses in link-map
    function freezeManifest(
        string[] calldata componentIds,
        address[] calldata addresses
    ) external onlyRole(MANIFEST_ADMIN_ROLE) notFrozen {
        bytes32 linkMapHash = CrossChainDeploymentLib.computeLinkMapHash(
            componentIds,
            addresses,
            block.chainid
        );
        
        CrossChainDeploymentLib.freezeManifest(manifest, linkMapHash);
        
        emit ManifestFrozen(manifest.manifestHash, linkMapHash, block.timestamp);
    }
    
    /// @notice Check if manifest is frozen
    /// @return isFrozen Whether manifest is frozen
    /// @return freezeTimestamp When manifest was frozen (0 if not frozen)
    /// @return linkMapHash Hash of frozen link-map
    function getManifestFreezeStatus() 
        external 
        view 
        returns (bool isFrozen, uint256 freezeTimestamp, bytes32 linkMapHash) 
    {
        isFrozen = manifest.frozen;
        freezeTimestamp = manifest.freezeTimestamp;
        linkMapHash = manifest.linkMapHash;
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // MANIFEST ANNOTATIONS
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Get component address from manifest
    /// @param componentId Component identifier
    /// @return componentAddress Address of component (zero if not found)
    function getComponentAddress(string calldata componentId) 
        external 
        view 
        returns (address componentAddress) 
    {
        return manifest.getComponentAddress(componentId);
    }
    
    /// @notice Get component codehash from manifest
    /// @param componentId Component identifier
    /// @return codehash Codehash of component (zero if not found)
    function getComponentCodehash(string calldata componentId) 
        external 
        view 
        returns (bytes32 codehash) 
    {
        return manifest.getComponentCodehash(componentId);
    }
    
    /// @notice Check if chain is supported
    /// @param chainId Chain ID to check
    /// @return isSupported Whether chain is supported
    function isChainSupported(uint256 chainId) 
        external 
        view 
        returns (bool isSupported) 
    {
        return manifest.isChainSupported(chainId);
    }
    
    /// @notice Add chain support (admin only)
    /// @param chainId Chain ID to add support for
    function addChainSupport(uint256 chainId) 
        external 
        onlyRole(MANIFEST_ADMIN_ROLE) 
        notFrozen 
    {
        manifest.markChainSupported(chainId);
        emit ChainSupportAdded(chainId, manifest.manifestHash);
    }
    
    // ══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════
    
    /// @notice Get manifest hash
    /// @return manifestHash Current manifest hash
    function getManifestHash() external view returns (bytes32 manifestHash) {
        return manifest.manifestHash;
    }
    
    /// @notice Get default deployment configuration
    /// @return deployer Default deployer address
    /// @return chainScoped Default chain scoping policy
    /// @return manifestHash Current manifest hash
    function getDefaultConfig() 
        external 
        view 
        returns (address deployer, bool chainScoped, bytes32 manifestHash) 
    {
        deployer = defaultDeployer;
        chainScoped = defaultChainScoped;
        manifestHash = manifest.manifestHash;
    }
    
    /// @notice Validate deployment consistency for a component
    /// @param componentId Component identifier
    /// @param version Version string
    /// @param initCode Contract initialization bytecode
    /// @param useChainScoped Whether to use chain-scoped salt
    /// @param expectedAddress Expected deployment address
    /// @return isConsistent Whether prediction matches expected
    function validateConsistency(
        string calldata componentId,
        string calldata version,
        bytes calldata initCode,
        bool useChainScoped,
        address expectedAddress
    ) external view returns (bool isConsistent) {
        CrossChainDeploymentLib.ComponentConfig memory config = CrossChainDeploymentLib.ComponentConfig({
            manifestHash: manifest.manifestHash,
            componentId: componentId,
            version: version,
            deployer: defaultDeployer,
            initCode: initCode,
            chainScoped: useChainScoped
        });
        
        return CrossChainDeploymentLib.validateConsistency(config, expectedAddress);
    }
}
