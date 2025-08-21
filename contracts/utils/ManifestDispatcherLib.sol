// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title ManifestDispatcherLib
 * @notice Utilities for ManifestDispatcher: facet integrity checks, selector bookkeeping,
 *         batch guards, and selector hashing. Designed to accept storage references from
 *         the dispatcher (no diamond storage slot used here).
 *
 * @dev Typical usage in ManifestDispatcher:
 *   using ManifestDispatcherLib for *;
 *   ManifestDispatcherLib.requireNoDuplicateSelectors(selectors);
 *   ManifestDispatcherLib.verifyFacetIntegrity(facet, expectedHash, MAX_FACET_CODE);
 *   ManifestDispatcherLib.addSelectorToFacet(facetSelectors, _facetAddresses, facet, selector);
 *   ManifestDispatcherLib.removeSelectorFromFacet(facetSelectors, _facetAddresses, facet, selector);
 *   bytes32 fp = ManifestDispatcherLib.selectorHash(facetSelectors, facet);
 */
library ManifestDispatcherLib {
    // ───────────────────────── Errors ─────────────────────────
    error BatchTooLarge(uint256 n);
    error DuplicateSelector(bytes4 selector);
    error ZeroCodeFacet(address facet);
    error CodeSizeExceeded(address facet, uint256 size, uint256 maxSize);
    error FacetCodeMismatch(address facet, bytes32 expected, bytes32 actual);
    error ZeroAddress();

    // ─────────────────────── Batch helpers ───────────────────────
    /**
     * @notice Revert if n exceeds maxBatch.
     */
    function boundBatch(uint256 n, uint256 maxBatch) internal pure {
        if (n > maxBatch) revert BatchTooLarge(n);
    }

    /**
     * @notice O(n^2) duplicate guard for small batches (selectors are small).
     */
    function requireNoDuplicateSelectors(bytes4[] calldata selectors) internal pure {
        uint256 n = selectors.length;
        for (uint256 i = 0; i < n; i++) {
            bytes4 a = selectors[i];
            for (uint256 j = i + 1; j < n; j++) {
                if (a == selectors[j]) revert DuplicateSelector(a);
            }
        }
    }

    // ─────────────────── Facet integrity checks ───────────────────
    /**
     * @notice Verify facet bytecode is present, <= maxSize, and matches expected codehash (if nonzero).
     * @dev Reverts with precise errors on violation.
     * @return actualCodehash facet.codehash (for logging/provenance)
     * @return size          facet.code.length
     */
    function verifyFacetIntegrity(
        address facet,
        bytes32 expectedCodehash,
        uint256 maxSize
    ) internal view returns (bytes32 actualCodehash, uint256 size) {
        if (facet == address(0)) revert ZeroAddress();
        size = facet.code.length;
        if (size == 0) revert ZeroCodeFacet(facet);
        if (size > maxSize) revert CodeSizeExceeded(facet, size, maxSize);
        actualCodehash = facet.codehash;
        if (expectedCodehash != bytes32(0) && actualCodehash != expectedCodehash) {
            revert FacetCodeMismatch(facet, expectedCodehash, actualCodehash);
        }
    }

    // ───────────── Selector registry (per-facet arrays) ─────────────
    /**
     * @notice Add a selector to a facet’s selector list; avoids duplicates and tracks first-seen facet.
     * @param facetSelectors mapping(address => bytes4[]) storage reference
     * @param facetAddresses address[] storage reference of all known facet addresses
     * @param facet          facet to add selector to (must be nonzero)
     * @param selector       function selector to register
     * @return wasNewFacet   true if this was the first selector for this facet
     * @return added         true if selector was appended (false if it already existed)
     */
    function addSelectorToFacet(
        mapping(address => bytes4[]) storage facetSelectors,
        address[] storage facetAddresses,
        address facet,
        bytes4 selector
    ) internal returns (bool wasNewFacet, bool added) {
        if (facet == address(0)) revert ZeroAddress();

        bytes4[] storage sels = facetSelectors[facet];
        uint256 len = sels.length;

        // If first time, track facet address
        if (len == 0) {
            facetAddresses.push(facet);
            wasNewFacet = true;
        }

        // De-dupe
        for (uint256 i = 0; i < len; i++) {
            if (sels[i] == selector) return (wasNewFacet, false);
        }
        sels.push(selector);
        return (wasNewFacet, true);
    }

    /**
     * @notice Remove a selector from a facet’s list; if list becomes empty, drop facet from facetAddresses.
     * @param facetSelectors mapping(address => bytes4[]) storage reference
     * @param facetAddresses address[] storage reference of all known facet addresses
     * @param facet          facet to prune
     * @param selector       selector to remove (no-op if absent)
     * @return removed       true if selector was removed
     * @return facetRemoved  true if facet had no selectors left and was removed from facetAddresses
     */
    function removeSelectorFromFacet(
        mapping(address => bytes4[]) storage facetSelectors,
        address[] storage facetAddresses,
        address facet,
        bytes4 selector
    ) internal returns (bool removed, bool facetRemoved) {
        bytes4[] storage sels = facetSelectors[facet];
        uint256 len = sels.length;

        // Remove selector if present (swap-pop)
        for (uint256 i = 0; i < len; i++) {
            if (sels[i] == selector) {
                sels[i] = sels[len - 1];
                sels.pop();
                removed = true;
                break;
            }
        }

        // If facet now empty, remove from facetAddresses
        if (removed && sels.length == 0) {
            uint256 n = facetAddresses.length;
            for (uint256 j = 0; j < n; j++) {
                if (facetAddresses[j] == facet) {
                    facetAddresses[j] = facetAddresses[n - 1];
                    facetAddresses.pop();
                    facetRemoved = true;
                    break;
                }
            }
        }
    }

    // ───────────────────── Selector fingerprint ─────────────────────
    /**
     * @notice Deterministic selector fingerprint for a facet: keccak256(facet.codehash || sorted(selectors)).
     * @dev Uses in-memory insertion sort (small n) for gas simplicity.
     */
    function selectorHash(
        mapping(address => bytes4[]) storage facetSelectors,
        address facet
    ) internal view returns (bytes32) {
        bytes4[] memory sels = facetSelectors[facet];
        uint256 n = sels.length;

        // insertion sort by uint32(selector)
        for (uint256 i = 1; i < n; i++) {
            bytes4 key = sels[i];
            uint256 j = i;
            while (j > 0 && uint32(sels[j - 1]) > uint32(key)) {
                sels[j] = sels[j - 1];
                unchecked { --j; }
            }
            sels[j] = key;
        }

        return keccak256(abi.encodePacked(facet.codehash, sels));
    }
}

