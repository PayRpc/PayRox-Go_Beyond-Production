// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IDiamondLoupe} from "../interfaces/IDiamondLoupe.sol";
import {IDiamondLoupeEx} from "../interfaces/IDiamondLoupeEx.sol";

/**
 * @title IDispatcherIndexView
 * @notice Interface for reading dispatcher's loupe index
 * @dev Abstraction layer between LoupeFacet and dispatcher storage
 */
interface IDispatcherIndexView {
    function listFacets() external view returns (address[] memory);
    function listSelectors(address facet) external view returns (bytes4[] memory);
    function route(bytes4 sel) external view returns (address facet, bytes32 codehash);

    // Extended metadata
    function facetVersionTag(address facet) external view returns (bytes32);
    function facetSecurityLevel(address facet) external view returns (uint8);
    function facetProvenanceOf(address facet) external view returns (address deployer, uint256 timestamp);
    function facetMetadataOf(address facet) external view returns (
        string memory name,
        string memory category,
        string[] memory dependencies,
        bool isUpgradeable
    );
}

/**
 * @title LoupeFacet
 * @notice Drop-in loupe facet implementing both EIP-2535 and extended interfaces
 * @dev Reads from dispatcher's maintained index, keeping gas low and guaranteeing enumeration
 */
contract LoupeFacet is IDiamondLoupe, IDiamondLoupeEx {
    IDispatcherIndexView private immutable dispatcher_;

    constructor(address dispatcherView) {
        require(dispatcherView != address(0), "LoupeFacet: zero dispatcher");
        dispatcher_ = IDispatcherIndexView(dispatcherView);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // EIP-2535 Standard Loupe (100% compatible with ecosystem tooling)
    // ───────────────────────────────────────────────────────────────────────────

    function facets() external view override returns (Facet[] memory out) {
        address[] memory addrs = dispatcher_.listFacets();
        out = new Facet[](addrs.length);
        for (uint256 i = 0; i < addrs.length; ++i) {
            out[i].facetAddress = addrs[i];
            out[i].functionSelectors = dispatcher_.listSelectors(addrs[i]);
        }
    }

    function facetFunctionSelectors(address facet) external view override returns (bytes4[] memory) {
        return dispatcher_.listSelectors(facet);
    }

    function facetAddresses() external view override returns (address[] memory) {
        return dispatcher_.listFacets();
    }

    function facetAddress(bytes4 selector) external view override returns (address facet_) {
        (facet_,) = dispatcher_.route(selector);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Extended Loupe (PayRox-specific with provenance/metadata/security)
    // ───────────────────────────────────────────────────────────────────────────

    function facetAddressesEx(bool includeUnsafe) external view override returns (address[] memory) {
        address[] memory allFacets = dispatcher_.listFacets();

        if (includeUnsafe) {
            return allFacets;
        }

        // Filter out unsafe facets (security level 0)
        uint256 count = 0;
        for (uint256 i = 0; i < allFacets.length; ++i) {
            if (dispatcher_.facetSecurityLevel(allFacets[i]) > 0) {
                count++;
            }
        }

        address[] memory safeFacets = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allFacets.length; ++i) {
            address facet = allFacets[i];
            if (dispatcher_.facetSecurityLevel(facet) > 0) {
                safeFacets[idx++] = facet;
            }
        }

        return safeFacets;
    }

    function facetFunctionSelectorsEx(address facet, uint8 minLevel) external view override returns (bytes4[] memory) {
        uint8 facetLevel = dispatcher_.facetSecurityLevel(facet);
        if (facetLevel < minLevel) {
            return new bytes4[](0);
        }
        return dispatcher_.listSelectors(facet);
    }

    function facetsEx(bool includeMetadata) external view override returns (FacetEx[] memory out) {
        address[] memory addrs = dispatcher_.listFacets();
        out = new FacetEx[](addrs.length);

        for (uint256 i = 0; i < addrs.length; ++i) {
            address facet = addrs[i];
            out[i].facetAddress = facet;
            out[i].functionSelectors = dispatcher_.listSelectors(facet);
            out[i].versionTag = dispatcher_.facetVersionTag(facet);
            out[i].securityLevel = dispatcher_.facetSecurityLevel(facet);
        }
    }

    function facetAddressEx(bytes4 selector, bytes32 version) external view override returns (address facet_) {
        (address facet,) = dispatcher_.route(selector);
        if (facet == address(0)) return address(0);

        // If version filter specified, check version tag
        if (version != bytes32(0) && dispatcher_.facetVersionTag(facet) != version) {
            return address(0);
        }

        return facet;
    }

    function facetAddressesBatchEx(bytes4[] calldata selectors) external view override returns (address[] memory addresses_) {
        addresses_ = new address[](selectors.length);
        for (uint256 i = 0; i < selectors.length; ++i) {
            (addresses_[i],) = dispatcher_.route(selectors[i]);
        }
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Fingerprints / Provenance
    // ───────────────────────────────────────────────────────────────────────────

    function facetHash(address facet) external view override returns (bytes32 hash_) {
        assembly { hash_ := extcodehash(facet) }
    }

    function selectorHash(address facet) external view override returns (bytes32) {
        bytes4[] memory selectors = dispatcher_.listSelectors(facet);

        // Sort selectors for deterministic hash
        _quickSort(selectors, 0, int256(selectors.length - 1));

        bytes32 facetCodeHash;
        assembly { facetCodeHash := extcodehash(facet) }

        return keccak256(abi.encodePacked(facetCodeHash, selectors));
    }

    function facetProvenance(address facet) external view override returns (address deployer, uint256 timestamp) {
        (deployer, timestamp) = dispatcher_.facetProvenanceOf(facet);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Optional Extras (lightweight implementations)
    // ───────────────────────────────────────────────────────────────────────────

    function checkStorageConflicts(address /*facet*/) external pure override returns (bytes32[] memory conflicts_) {
        // Return empty array - storage conflict detection is complex and gas-expensive
        // Better handled off-chain in deployment tooling
        conflicts_ = new bytes32[](0);
    }

    function facetImplementation(address /*facet*/) external pure override returns (address implementation_) {
        // Return zero - facets are implementations themselves in this architecture
        implementation_ = address(0);
    }

    function facetMetadata(address facet) external view override returns (FacetMetadata memory metadata_) {
        (metadata_.name, metadata_.category, metadata_.dependencies, metadata_.isUpgradeable) =
            dispatcher_.facetMetadataOf(facet);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Internal Helpers
    // ───────────────────────────────────────────────────────────────────────────

    /**
     * @dev Quick sort implementation for bytes4 arrays
     * @param arr Array to sort
     * @param left Start index
     * @param right End index
     */
    function _quickSort(bytes4[] memory arr, int256 left, int256 right) internal pure {
        if (left >= right) return;

        int256 index = _partition(arr, left, right);
        _quickSort(arr, left, index - 1);
        _quickSort(arr, index + 1, right);
    }

    /**
     * @dev Partition function for quicksort
     */
    function _partition(bytes4[] memory arr, int256 left, int256 right) internal pure returns (int256) {
        bytes4 pivot = arr[uint256(right)];
        int256 i = left - 1;

        for (int256 j = left; j < right; j++) {
            if (uint32(arr[uint256(j)]) <= uint32(pivot)) {
                i++;
                (arr[uint256(i)], arr[uint256(j)]) = (arr[uint256(j)], arr[uint256(i)]);
            }
        }

        (arr[uint256(i + 1)], arr[uint256(right)]) = (arr[uint256(right)], arr[uint256(i + 1)]);
        return i + 1;
    }
}

