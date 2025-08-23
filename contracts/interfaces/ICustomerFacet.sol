// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ICustomerFacet {
    event CustomerInitialized(address operator);
    event CustomerConfigSet(uint256 newValue, address indexed by);

    function initializeCustomer(address operator) external;
    function setConfig(uint256 newValue) external;
    function getConfig() external view returns (uint256);

    function getFacetInfo()
        external
        pure
        returns (string memory name, string memory version, bytes4[] memory selectors);
}
