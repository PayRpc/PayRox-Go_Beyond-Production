// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library CustomerStorage {
    bytes32 internal constant SLOT = keccak256("payrox.facets.customer.v1");

    struct Layout {
        bool initialized;
        address operator;
        uint256 config;
        uint256 ops;
        address lastCaller;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = SLOT;
        assembly { l.slot := slot }
    }
}
