// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * Demo Facet A - Simple functions for testing
 */
contract DemoFacetA {

    function transferFrom(address from, address to, uint256 amount) external pure returns (bool) {
        // Demo implementation
        return from != address(0) && to != address(0) && amount > 0;
    }

    function approve(address spender, uint256 amount) external pure returns (bool) {
        // Demo implementation
        return spender != address(0) && amount >= 0;
    }

    function balanceOf(address account) external pure returns (uint256) {
        // Demo implementation
        return account != address(0) ? 1000 : 0;
    }

    function allowance(address owner, address spender) external pure returns (uint256) {
        // Demo implementation
        return owner != address(0) && spender != address(0) ? 500 : 0;
    }
}
