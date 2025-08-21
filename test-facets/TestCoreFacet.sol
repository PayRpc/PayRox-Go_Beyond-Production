// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


import {LibDiamond} from "../libraries/LibDiamond.sol";

contract TestCoreFacet /* is ITestCoreFacet */ {


  modifier onlyDispatcher() {
    LibDiamond.enforceManifestCall();
    _;
  }

  function initializeSystem() external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function adminSetup() external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function isPaused() external pure returns (bool) {
    revert("TODO: migrate logic from monolith");
  }

}
