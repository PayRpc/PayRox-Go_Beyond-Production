// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


import {LibDiamond} from "../libraries/LibDiamond.sol";

contract TestViewFacet /* is ITestViewFacet */ {


  modifier onlyDispatcher() {
    LibDiamond.enforceManifestCall();
    _;
  }

  function getBalance() external view returns (uint256) {
    revert("TODO: migrate logic from monolith");
  }

}
