// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IRewardsFacet {
    event RewardsInitialized(address operator);
    event RewardsConfigSet(uint256 newValue, address indexed by);

    function initializeRewards(address operator) external;
    function setConfig(uint256 newValue) external;
    function getConfig() external view returns (uint256);

    function getFacetInfo()
        external
        pure
        returns (string memory name, string memory version, bytes4[] memory selectors);
}
