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

contract ManifestDispatcherLogicFacet /* is IManifestDispatcherLogicFacet */ {


  modifier onlyDispatcher() {
    LibDiamond.enforceManifestCall();
    _;
  }

  function constructor(address admin, uint64 activationDelaySeconds) public onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function receive() external payable onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function fallback() external payable onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function commitRoot(bytes32 newRoot, uint64 newEpoch) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function applyRoutes(bytes4[] calldata selectors,
        address[] calldata facetAddrs,
        bytes32[] calldata codehashes,
        bytes32[][] calldata proofs,
        bool[][]   calldata isRight) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function activateCommittedRoot() external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function removeRoutes(bytes4[] calldata selectors) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function setActivationDelay(uint64 newDelay) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function freeze() external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function setDevRegistrarEnabled(bool enabled) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function _setRoute(bytes4 selector, address facet, bytes32 codehash) internal onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function _addSelectorToFacet(address facet, bytes4 selector) internal onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function _removeSelectorFromFacet(address facet, bytes4 selector) internal onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function applyRouteOne(bytes4 selector,
        address facetAddr,
        bytes32 codehash,
        bytes32[] calldata proof,
        bool[] calldata isRight_) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function setFacetSecurityLevel(address facet, uint8 level) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function setFacetVersionTag(address facet, bytes32 tag) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

}
