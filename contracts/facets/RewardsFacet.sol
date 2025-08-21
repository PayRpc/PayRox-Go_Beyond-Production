// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { PayRoxAccessControlStorage as ACS } from "../libraries/PayRoxAccessControlStorage.sol";
import { PayRoxPauseStorage as PS } from "../libraries/PayRoxPauseStorage.sol";
import { IRewardsFacet } from "../interfaces/IRewardsFacet.sol";
import { RewardsStorage as S } from "../libraries/RewardsStorage.sol";

contract RewardsFacet is IRewardsFacet {
    /* Errors */
    error Paused();
    error NotAdmin();
    error NotOperator();
    error AlreadyInitialized();
    error ZeroAddress();

    /* Optional role key (handy if you expand beyond operator) */
    bytes32 public constant REWARDS_OPERATOR_ROLE = keccak256("Rewards_OPERATOR");

    /* Modifiers */
    modifier whenNotPaused() {
        if (PS.layout().paused) revert Paused();
        _;
    }

    modifier onlyAdmin() {
        if (!ACS.layout().roles[ACS.DEFAULT_ADMIN_ROLE][msg.sender]) revert NotAdmin();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != S.layout().operator) revert NotOperator();
        _;
    }

    /* Init (one-time, diamond-safe) */
    function initializeRewards(address operator) external onlyAdmin {
        if (operator == address(0)) revert ZeroAddress();
        S.Layout storage l = S.layout();
        if (l.initialized) revert AlreadyInitialized();
        l.initialized = true;
        l.operator = operator;
        emit RewardsInitialized(operator);
    }

    /* Core API */
    function setRewardConfig(uint256 newValue) external whenNotPaused onlyOperator {
        S.Layout storage l = S.layout();
        l.config = newValue;
        unchecked { l.ops += 1; }
        l.lastCaller = msg.sender;
        emit RewardsConfigSet(newValue, msg.sender);
    }

    function getRewardConfig() external view returns (uint256) {
        return S.layout().config;
    }

    function getRewardState()
        external
        view
        returns (uint256 config, uint256 ops, address operator, address lastCaller, bool paused)
    {
        S.Layout storage l = S.layout();
        return (l.config, l.ops, l.operator, l.lastCaller, PS.layout().paused);
    }
}
