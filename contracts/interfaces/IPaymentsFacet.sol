// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IPaymentsFacet
/// @notice Interface for PayRox Payments functionality
interface IPaymentsFacet {
    // ───────────────────────────── Events ─────────────────────────────
    event PaymentsInitialized(address indexed operator);
    event PaymentsConfigSet(uint256 indexed newValue, address indexed caller);

    // ───────────────────────────── Functions ─────────────────────────────
    /// @notice Initialize the payments system
    /// @param operator The operator address
    function initializePayments(address operator) external;

    /// @notice Set configuration value
    /// @param newValue New configuration value
    function setConfig(uint256 newValue) external;

    /// @notice Get current operator
    /// @return The current operator address
    function getOperator() external view returns (address);

    /// @notice Get current configuration
    /// @return The current configuration value
    function getConfig() external view returns (uint256);

    /// @notice Get operations count
    /// @return The operations count
    function getOps() external view returns (uint256);

    /// @notice Get last caller
    /// @return The last caller address
    function getLastCaller() external view returns (address);

    /// @notice Get initialization status
    /// @return True if initialized
    function isInitialized() external view returns (bool);
}
