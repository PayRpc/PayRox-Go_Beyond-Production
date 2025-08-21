// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title Example
 * @notice Example test contract for PayRox testing infrastructure
 * @dev Simple contract for testing deployment and basic operations
 */
contract Example {
    uint256 public value;
    address public owner;

    event ValueSet(uint256 newValue, address indexed setter);

    constructor() {
        owner = msg.sender;
        value = 42;
    }

    function setValue(uint256 _value) external {
        value = _value;
        emit ValueSet(_value, msg.sender);
    }

    function getValue() external view returns (uint256) {
        return value;
    }

    function getOwner() external view returns (address) {
        return owner;
    }
}
