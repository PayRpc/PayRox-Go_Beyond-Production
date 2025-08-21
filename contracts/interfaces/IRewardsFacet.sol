// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IRewardsFacet {
    event RewardsInitialized(address operator);
    event RewardsConfigSet(uint256 newValue, address indexed by);

    function initializeRewards(address operator) external;
    function setRewardConfig(uint256 newValue) external;
    function getRewardConfig() external view returns (uint256);
    function getRewardState()
        external
        view
        returns (uint256 config, uint256 ops, address operator, address lastCaller, bool paused);
}
