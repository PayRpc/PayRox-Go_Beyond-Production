// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal interface for a deterministic CREATE2 deployer used to deploy facet contracts.
interface IDeterministicChunkFactory {
    /// @notice Deploy `bytecode` via CREATE2 with `salt`. If the deployed codehash doesn't match `expectedCodehash` revert.
    /// Returns (deployedAddress, codehash)
    function deploy(bytes calldata bytecode, bytes32 salt, bytes32 expectedCodehash) external payable returns (address deployed, bytes32 codehash);

    /// @notice Compute the deterministic address for given `salt` and `bytecodeHash` (expected EXTCODEHASH)
    function computeAddress(bytes32 salt, bytes32 bytecodeHash, address deployer) external pure returns (address);

    /// @notice Idempotent check: return deployed address if code already exists matching expectedCodehash; otherwise deploy.
    function ensureDeployed(bytes calldata bytecode, bytes32 salt, bytes32 expectedCodehash) external payable returns (address deployed, bytes32 codehash);
}
