// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MockAuditRegistry {
    mapping(bytes32 => bool) public status;
    bool public shouldRevert;

    function setStatus(bytes32 h, bool v) external {
        status[h] = v;
    }

    function setRevert(bool r) external {
        shouldRevert = r;
    }

    function getAuditStatus(bytes32 manifestHash)
        external
        view
        returns (bool isValid, bytes memory auditInfo)
    {
        if (shouldRevert) revert("mock revert");
        isValid = status[manifestHash];
        auditInfo = abi.encodePacked(isValid ? "ok" : "bad");
    }
}
