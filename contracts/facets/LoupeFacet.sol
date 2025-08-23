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
 * @dev Delegates to dispatcher for single source of truth, preventing state divergence
 */
contract LoupeFacet is IDiamondLoupe, IDiamondLoupeEx {
    address public immutable dispatcher;

    constructor(address _dispatcher) {
        require(_dispatcher != address(0), "LoupeFacet: zero dispatcher");
        dispatcher = _dispatcher;
    }

    // ───────────────────────────────────────────────────────────────────────────
    // EIP-2535 Standard Loupe (100% compatible with ecosystem tooling)
    // ───────────────────────────────────────────────────────────────────────────

    function facets() external view override returns (Facet[] memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facets()")
        );
        require(ok, "LoupeFacet: facets() failed");
        return abi.decode(data, (Facet[]));
    }

    function facetFunctionSelectors(address facet) external view override returns (bytes4[] memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetFunctionSelectors(address)", facet)
        );
        require(ok, "LoupeFacet: facetFunctionSelectors() failed");
        return abi.decode(data, (bytes4[]));
    }

    function facetAddresses() external view override returns (address[] memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetAddresses()")
        );
        require(ok, "LoupeFacet: facetAddresses() failed");
        return abi.decode(data, (address[]));
    }

    function facetAddress(bytes4 selector) external view override returns (address) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetAddress(bytes4)", selector)
        );
        require(ok, "LoupeFacet: facetAddress() failed");
        return abi.decode(data, (address));
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Extended Loupe (PayRox-specific with provenance/metadata/security)
    // ───────────────────────────────────────────────────────────────────────────

    function facetAddressesEx(bool includeUnsafe) external view override returns (address[] memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetAddressesEx(bool)", includeUnsafe)
        );
        require(ok, "LoupeFacet: facetAddressesEx() failed");
        return abi.decode(data, (address[]));
    }

    function facetFunctionSelectorsEx(address facet, uint8 minLevel) external view override returns (bytes4[] memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetFunctionSelectorsEx(address,uint8)", facet, minLevel)
        );
        require(ok, "LoupeFacet: facetFunctionSelectorsEx() failed");
        return abi.decode(data, (bytes4[]));
    }

    function facetsEx(bool includeMetadata) external view override returns (FacetEx[] memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetsEx(bool)", includeMetadata)
        );
        require(ok, "LoupeFacet: facetsEx() failed");
        return abi.decode(data, (FacetEx[]));
    }

    function facetAddressEx(bytes4 selector, bytes32 version) external view override returns (address) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetAddressEx(bytes4,bytes32)", selector, version)
        );
        require(ok, "LoupeFacet: facetAddressEx() failed");
        return abi.decode(data, (address));
    }

    function facetAddressesBatchEx(bytes4[] calldata selectors) external view override returns (address[] memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetAddressesBatchEx(bytes4[])", selectors)
        );
        require(ok, "LoupeFacet: facetAddressesBatchEx() failed");
        return abi.decode(data, (address[]));
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Fingerprints / Provenance
    // ───────────────────────────────────────────────────────────────────────────

    function facetHash(address facet) external view override returns (bytes32) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetHash(address)", facet)
        );
        require(ok, "LoupeFacet: facetHash() failed");
        return abi.decode(data, (bytes32));
    }

    function selectorHash(address facet) external view override returns (bytes32) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("selectorHash(address)", facet)
        );
        require(ok, "LoupeFacet: selectorHash() failed");
        return abi.decode(data, (bytes32));
    }

    function facetProvenance(address facet) external view override returns (address deployer, uint256 timestamp) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetProvenance(address)", facet)
        );
        require(ok, "LoupeFacet: facetProvenance() failed");
        return abi.decode(data, (address, uint256));
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Optional Extras (lightweight implementations)
    // ───────────────────────────────────────────────────────────────────────────

    function checkStorageConflicts(address facet) external view override returns (bytes32[] memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("checkStorageConflicts(address)", facet)
        );
        if (!ok) {
            // Return empty array if not implemented
            return new bytes32[](0);
        }
        return abi.decode(data, (bytes32[]));
    }

    function facetImplementation(address facet) external view override returns (address) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetImplementation(address)", facet)
        );
        if (!ok) {
            // Return zero if not implemented
            return address(0);
        }
        return abi.decode(data, (address));
    }

    function facetMetadata(address facet) external view override returns (FacetMetadata memory) {
        (bool ok, bytes memory data) = dispatcher.staticcall(
            abi.encodeWithSignature("facetMetadata(address)", facet)
        );
        require(ok, "LoupeFacet: facetMetadata() failed");
        return abi.decode(data, (FacetMetadata));
    }

    // ───────────────────────────────────────────────────────────────────────────
    // ERC-165 Support
    // ───────────────────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IDiamondLoupe).interfaceId ||
               interfaceId == type(IDiamondLoupeEx).interfaceId ||
               interfaceId == 0x01ffc9a7; // ERC-165
    }
}

