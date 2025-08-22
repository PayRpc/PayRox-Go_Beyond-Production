// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IOrchestrator {
    /// @notice Propose a plan: arrays of selectors, facets, and expected codehashes, plus optional ETA (unix seconds)
    function proposePlan(bytes4[] calldata selectors, address[] calldata facets, bytes32[] calldata codehashes, uint64 eta) external;

    /// @notice Commit a proposed plan (move to pending/root commit on dispatcher)
    function commitPlan(bytes32 manifestRoot, uint64 epoch) external;

    /// @notice Apply a committed plan after the activation delay
    function applyPlan() external;

    /// @notice Convenience: deploy facets via factory, return addresses and codehashes
    function deployAndVerify(address factory, bytes[] calldata bytecodes, bytes32[] calldata salts, bytes32[] calldata expectedCodehashes) external payable returns (address[] memory addrs, bytes32[] memory codehashes);
}
