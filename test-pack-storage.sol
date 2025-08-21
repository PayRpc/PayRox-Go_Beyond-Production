// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../contracts/utils/GasOptimizationUtils.sol";

contract TestPackStorage {
    using GasOptimizationUtils for uint256[];

    function testPackStorage() external pure returns (bytes32) {
        uint256[] memory messageLengths = new uint256[](3);
        messageLengths[0] = 100;
        messageLengths[1] = 200;
        messageLengths[2] = 300;
        
        return GasOptimizationUtils.packStorage(messageLengths);
    }
    
    function testPackStorageEmpty() external pure returns (bytes32) {
        uint256[] memory messageLengths = new uint256[](0);
        return GasOptimizationUtils.packStorage(messageLengths);
    }
}
