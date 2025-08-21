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

contract ManifestDispatcherCoreFacet /* is IManifestDispatcherCoreFacet */ {


  modifier onlyDispatcher() {
    LibDiamond.enforceManifestCall();
    _;
  }

  function adminRegisterUnsafe(address[] calldata facets_, bytes4[][] calldata selectors_) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

}
