// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title SaltPolicyLib
/// @notice Canonical salt + CREATE2 helpers used across PayRox
library SaltPolicyLib {
    /// @dev EIP-2470 singleton CREATE2 deployer (widely deployed)
    address internal constant EIP2470 = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Domain tags (versioned for forward-compat)
    string internal constant DOMAIN = "PayRoxCrossChain:v1";
    string internal constant FACTORY_DOMAIN = "PayRoxFactory:v1";

    // ───────────────────────── Salts ─────────────────────────

    /// @notice Compute universal cross-chain salt (legacy/tooling parity)
    /// @dev Packed encoding; prefer hashed variants for production.
    /// @dev TS type list: ["string","address","string","uint256","string"]
    function universalSalt(
        address deployer,
        string memory content,
        uint256 crossNonce,
        string memory version
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, deployer, content, crossNonce, version));
    }

    /// @notice Canonical hashed variant (preferred for strict determinism)
    /// @dev TS type list: ["string","address","bytes32","uint256","bytes32"]
    function universalSaltHashed(
        address deployer,
        bytes32 contentHash,
        uint256 crossNonce,
        bytes32 versionHash
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, deployer, contentHash, crossNonce, versionHash));
    }

    /// @notice Chain-scoped salt (prevents cross-chain address collisions)
    /// @dev TS type list: ["string","uint256","address","bytes32","uint256","bytes32"]
    function universalSaltHashedChain(
        uint256 chainId,
        address deployer,
        bytes32 contentHash,
        uint256 crossNonce,
        bytes32 versionHash
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(DOMAIN, chainId, deployer, contentHash, crossNonce, versionHash));
    }

    /// @notice Convenience: use the current chain id for chain-scoped salts
    /// @dev TS type list: ["string","uint256","address","bytes32","uint256","bytes32"]
    function universalSaltHashedHere(
        address deployer,
        bytes32 contentHash,
        uint256 crossNonce,
        bytes32 versionHash
    ) internal view returns (bytes32) {
        return universalSaltHashedChain(block.chainid, deployer, contentHash, crossNonce, versionHash);
    }

    /// @notice Salt for deterministic factory via EIP-2470
    /// @dev TS type list: ["string","string"]
    function factorySalt(string memory version) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(FACTORY_DOMAIN, version));
    }

    /// @notice Hashed factory variant (mirrors hashed policy)
    /// @dev TS type list: ["string","bytes32"]
    function factorySaltHashed(bytes32 versionHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(FACTORY_DOMAIN, versionHash));
    }

    /// @notice keccak256(initCode)
    function initCodeHash(bytes memory initCode) internal pure returns (bytes32) {
        return keccak256(initCode);
    }

    // ─────────────────────── CREATE2 address ───────────────────────

    /// @notice Deterministic CREATE2 address (EVM canon)
    /// @param deployer The CREATE2 deployer address (e.g., EIP-2470 or the factory)
    /// @param salt     32-byte salt
    /// @param initHash keccak256(initCode)
    function create2Address(
        address deployer,
        bytes32 salt,
        bytes32 initHash
    ) internal pure returns (address addr) {
        // address = last 20 bytes of keccak256(0xff ++ deployer ++ salt ++ init_code_hash)
        bytes32 digest = keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initHash));
        return address(uint160(uint256(digest))); // take last 20 bytes
    }

    /// @notice Convenience overload to avoid passing a mismatched initHash
    function create2AddressFromInitCode(
        address deployer,
        bytes32 salt,
        bytes memory initCode
    ) internal pure returns (address) {
        return create2Address(deployer, salt, keccak256(initCode));
    }
}
