// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { PayRoxAccessControlStorage as ACS } from "../libraries/PayRoxAccessControlStorage.sol";
import { PayRoxPauseStorage as PS } from "../libraries/PayRoxPauseStorage.sol";
import { IPaymentsFacet } from "../interfaces/IPaymentsFacet.sol";
import { PaymentsStorage as S } from "../libraries/PaymentsStorage.sol";

contract PaymentsFacet is IPaymentsFacet {
    /* Errors */
    error Paused();
    error NotAdmin();
    error NotOperator();
    error AlreadyInitialized();
    error ZeroAddress();

    /* Optional role key (handy if you expand beyond operator) */
    bytes32 public constant OPERATOR_ROLE = keccak256("Payments_OPERATOR");

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
    function initializePayments(address operator) external onlyAdmin {
        if (operator == address(0)) revert ZeroAddress();
        S.Layout storage l = S.layout();
        if (l.initialized) revert AlreadyInitialized();
        l.initialized = true;
        l.operator = operator;
        emit PaymentsInitialized(operator);
    }

    /* Core API */
    function setPaymentConfig(uint256 newValue) external whenNotPaused onlyOperator {
        S.Layout storage l = S.layout();
        l.config = newValue;
        unchecked { l.ops += 1; }
        l.lastCaller = msg.sender;
        emit PaymentsConfigSet(newValue, msg.sender);
    }

    function getPaymentConfig() external view returns (uint256) {
        return S.layout().config;
    }

    function getOperator() external view returns (address) {
        return S.layout().operator;
    }

    function getOps() external view returns (uint256) {
        return S.layout().ops;
    }

    function getLastCaller() external view returns (address) {
        return S.layout().lastCaller;
    }

    function isInitialized() external view returns (bool) {
        return S.layout().initialized;
    }

    function getPaymentState()
        external
        view
        returns (uint256 config, uint256 ops, address operator, address lastCaller, bool paused)
    {
        S.Layout storage l = S.layout();
        return (l.config, l.ops, l.operator, l.lastCaller, PS.layout().paused);
    }

    /* Facet metadata for manifest/loupe tooling */
    function getFacetInfo()
        external
        pure
        returns (string memory name, string memory version, bytes4[] memory selectors)
    {
        name = "PaymentsFacet";
        version = "1.0.0";
        selectors = new bytes4[](8);
        selectors[0] = this.initializePayments.selector;
        selectors[1] = this.setPaymentConfig.selector;
        selectors[2] = this.getPaymentConfig.selector;
        selectors[3] = this.getOperator.selector;
        selectors[4] = this.getOps.selector;
        selectors[5] = this.getLastCaller.selector;
        selectors[6] = this.isInitialized.selector;
        selectors[7] = this.getPaymentState.selector;
        // Note: getFacetInfo is not included to avoid self-reference issues
    }
}
