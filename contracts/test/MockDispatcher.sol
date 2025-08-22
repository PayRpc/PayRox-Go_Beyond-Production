// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MockDispatcher {
    function a() external pure returns (uint256){ return 1; }
    function b() external pure returns (uint256){ return 2; }
    // Minimal view surface to satisfy IManifestDispatcherView compatibility checks
    function activeRoot() external view returns (bytes32) { return bytes32(0); }
}
