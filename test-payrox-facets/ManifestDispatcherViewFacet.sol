// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PayRoxAccessControlStorage as ACS} from "../libraries/PayRoxAccessControlStorage.sol";
import {PayRoxPauseStorage as PS} from "../libraries/PayRoxPauseStorage.sol";
import {IManifestDispatcher} from "../interfaces/IManifestDispatcher.sol";
import {IDiamondLoupe}       from "../interfaces/IDiamondLoupe.sol";
import {IDiamondLoupeEx}     from "../interfaces/IDiamondLoupeEx.sol";
import {OrderedMerkle}       from "../utils/OrderedMerkle.sol";
import {RefactorSafetyLib}   from "../libraries/RefactorSafetyLib.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";

contract ManifestDispatcherViewFacet /* is IManifestDispatcherViewFacet */ {


  modifier onlyDispatcher() {
    LibDiamond.enforceManifestCall();
    _;
  }

  function routes(bytes4 selector) external view returns (address facet, bytes32 codehash) {
    revert("TODO: migrate logic from monolith");
  }

  function pendingRoot() external view returns (bytes32) {
    revert("TODO: migrate logic from monolith");
  }

  function pendingEpoch() external view returns (uint64) {
    revert("TODO: migrate logic from monolith");
  }

  function pendingSince() external view returns (uint64) {
    revert("TODO: migrate logic from monolith");
  }

  function activeRoot() external view returns (bytes32) {
    revert("TODO: migrate logic from monolith");
  }

  function activeEpoch() external view returns (uint64) {
    revert("TODO: migrate logic from monolith");
  }

  function activationDelay() external view returns (uint64) {
    revert("TODO: migrate logic from monolith");
  }

  function frozen() external view returns (bool) {
    revert("TODO: migrate logic from monolith");
  }

  function getManifestVersion() external view returns (uint64) {
    revert("TODO: migrate logic from monolith");
  }

  function getRoute(bytes4 selector) external view returns (address) {
    revert("TODO: migrate logic from monolith");
  }

  function getRouteCount() external view returns (uint256) {
    revert("TODO: migrate logic from monolith");
  }

  function facetSecurityLevel(address facet) external view returns (uint8) {
    revert("TODO: migrate logic from monolith");
  }

  function facetVersionTag(address facet) external view returns (bytes32) {
    revert("TODO: migrate logic from monolith");
  }

  function getLimits() external pure returns (uint256 maxBatch, uint256 maxFacetCode, uint64 maxActivationDelay) {
    revert("TODO: migrate logic from monolith");
  }

  function verifyManifest(bytes32 manifestHash) external view returns (bool ok, bytes32 current) {
    revert("TODO: migrate logic from monolith");
  }

  function isDevRegistrarEnabled() external view returns (bool) {
    revert("TODO: migrate logic from monolith");
  }

  function getManifestInfo() external view returns (IManifestDispatcher.ManifestInfo memory info) {
    revert("TODO: migrate logic from monolith");
  }

  function facetAddresses() external view returns (address[] memory) {
    revert("TODO: migrate logic from monolith");
  }

  function facetFunctionSelectors(address facet) external view returns (bytes4[] memory) {
    revert("TODO: migrate logic from monolith");
  }

  function facetAddress(bytes4 selector) external view returns (address) {
    revert("TODO: migrate logic from monolith");
  }

  function facets() external view returns (IDiamondLoupe.Facet[] memory out) {
    revert("TODO: migrate logic from monolith");
  }

  function facetAddressesEx(bool includeUnsafe) external view returns (address[] memory facetAddresses_) {
    revert("TODO: migrate logic from monolith");
  }

  function facetFunctionSelectorsEx(address facet, uint8 minSecurityLevel) external view returns (bytes4[] memory selectors_) {
    revert("TODO: migrate logic from monolith");
  }

  function facetsEx(bool) external view returns (IDiamondLoupeEx.FacetEx[] memory facets_) {
    revert("TODO: migrate logic from monolith");
  }

  function facetAddressEx(bytes4 functionSelector, bytes32 requiredVersion) external view returns (address facetAddress_) {
    revert("TODO: migrate logic from monolith");
  }

  function facetAddressesBatchEx(bytes4[] calldata functionSelectors) external view returns (address[] memory facetAddresses_) {
    revert("TODO: migrate logic from monolith");
  }

  function facetMetadata(address) external pure returns (IDiamondLoupeEx.FacetMetadata memory metadata_) {
    revert("TODO: migrate logic from monolith");
  }

  function checkStorageConflicts(address) external pure returns (bytes32[] memory conflicts_) {
    revert("TODO: migrate logic from monolith");
  }

  function facetImplementation(address) external pure returns (address implementation_) {
    revert("TODO: migrate logic from monolith");
  }

  function facetHash(address facet) external view returns (bytes32) {
    revert("TODO: migrate logic from monolith");
  }

  function selectorHash(address facet) external view returns (bytes32) {
    revert("TODO: migrate logic from monolith");
  }

  function facetProvenance(address facet) external view returns (address deployer, uint256 deployTimestamp) {
    revert("TODO: migrate logic from monolith");
  }

  function preflightCheckFacet(address facet,
        bytes32 expectedCodeHash,
        bytes4[] calldata claimedSelectors,
        bool allowAdditions) external view returns (bool ok, bytes32 selectorHashEx) {
    revert("TODO: migrate logic from monolith");
  }

  function _selectorHash(address facet) internal view returns (bytes32) {
    revert("TODO: migrate logic from monolith");
  }

}
