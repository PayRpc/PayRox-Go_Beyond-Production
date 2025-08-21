// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IAuditRegistry {
    /// @notice Return whether a manifest hash currently has a valid, non-expired, certified audit.
    /// @param manifestHash The manifest root/hash to check (e.g., pending/active root).
    /// @return isValid True iff the audit exists, is unexpired, auditor is still certified, and `passed == true`.
    /// @return auditInfo Opaque audit info blob (implementation-specific); dispatcher ignores its contents.
    function getAuditStatus(bytes32 manifestHash)
        external
        view
        returns (bool isValid, bytes memory auditInfo);
}
