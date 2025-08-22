// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract SimpleFacet {
    function ping() external pure returns (string memory) { return "pong"; }
}
