// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Diamond-safe storage for PaymentsFacet.
/// @dev UPGRADE RULES:
///      - Append new fields only (don’t reorder/remove).
///      - If you must break layout, bump the namespace (…v2) and migrate.
library PaymentsStorage {
    // Stable, namespaced slot for this facet’s storage.
    bytes32 internal constant SLOT = keccak256("payrox.facets.payments.v1");

    struct Layout {
        bool    initialized;   // one-time init guard
        address operator;      // facet-level operator
        uint256 config;        // arbitrary config value
        uint256 ops;           // op counter
        address lastCaller;    // last mutating caller
        // uint256[44] __gap;  // optional: reserve for future fields
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = SLOT;
        assembly { l.slot := slot }
    }
}
