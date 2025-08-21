// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


import {LibDiamond} from "../libraries/LibDiamond.sol";

contract TestLogicFacet /* is ITestLogicFacet */ {


  modifier onlyDispatcher() {
    LibDiamond.enforceManifestCall();
    _;
  }

  function constructor() public onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function deposit() external payable onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

  function transfer(address to, uint256 amount) external onlyDispatcher {
    revert("TODO: migrate logic from monolith");
  }

}
