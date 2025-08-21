// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title GasOptimizationUtils
 * @notice Utilities for gas-aware batched calls and compact packing.
 * @dev Library functions are internal to avoid delegatecall linkage and keep call sites explicit.
 */
library GasOptimizationUtils {
    uint256 internal constant MAX_BATCH = 64;

    /**
     * @notice Batch low-level calls. Reverts atomically on any failure and bubbles revert data.
     * @param targets Target addresses (must be nonzero)
     * @param data    Calldata blobs (one per target)
     * @return results Return data for each successful call
     */
    function batchCallStrict(
        address[] calldata targets,
        bytes[] calldata data
    ) internal returns (bytes[] memory results) {
        uint256 n = targets.length;
        require(n == data.length, "GasOpt:length");
        require(n <= MAX_BATCH, "GasOpt:batch");

        results = new bytes[](n);
        for (uint256 i = 0; i < n; ) {
            address t = targets[i];
            require(t != address(0), "GasOpt:zero");

            (bool ok, bytes memory ret) = t.call(data[i]);
            if (!ok) {
                // bubble exact revert reason from the failed call
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
            results[i] = ret;
            unchecked { ++i; }
        }
    }

    /**
     * @notice Flexible batch: optional ETH per call and optional per-call failure tolerance.
     * @param targets Target addresses
     * @param data    Calldata blobs
     * @param values  ETH to send per call (0 if not payable). Pass empty array to send 0 to all.
     * @param mustSucceed If provided, failures at indexes with true will bubble; false will record (ok=false).
     * @return okFlags Success flags per call
     * @return results  Return data per call (empty on failed/ignored)
     */
    function batchCallFlexible(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values,
        bool[] calldata mustSucceed
    ) internal returns (bool[] memory okFlags, bytes[] memory results) {
        uint256 n = targets.length;
        require(n == data.length, "GasOpt:length");
        require(n <= MAX_BATCH, "GasOpt:batch");
        // values and mustSucceed may be empty (treated as all zeros / all true)
        require(values.length == 0 || values.length == n, "GasOpt:values");
        require(mustSucceed.length == 0 || mustSucceed.length == n, "GasOpt:flags");

        okFlags = new bool[](n);
        results = new bytes[](n);

        for (uint256 i = 0; i < n; ) {
            address t = targets[i];
            require(t != address(0), "GasOpt:zero");

            uint256 val = values.length == 0 ? 0 : values[i];
            (bool ok, bytes memory ret) = t.call{value: val}(data[i]);

            if (!ok && (mustSucceed.length == 0 || mustSucceed[i])) {
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }

            okFlags[i] = ok;
            results[i] = ret;
            unchecked { ++i; }
        }
    }

    /**
     * @notice Pack up to four uint64 values into one bytes32 (little-endian lanes: slot0 at lowest bits).
     * @dev values.length must be <= 4. No inline assembly → fewer calldata layout pitfalls.
     */
    function packU64(bytes64Array calldata values) internal pure returns (bytes32 packed) {
        uint256 len = values.arr.length;
        require(len <= 4, "GasOpt:pack4");
        unchecked {
            for (uint256 i = 0; i < len; ++i) {
                packed |= bytes32(uint256(values.arr[i]) << (i * 64));
            }
        }
    }

    /**
     * @notice Unpack a bytes32 previously packed by packU64. Missing lanes become zero.
     */
    function unpackU64(bytes32 packed) internal pure returns (uint64 a, uint64 b, uint64 c, uint64 d) {
        a = uint64(uint256(packed));
        b = uint64(uint256(packed >> 64));
        c = uint64(uint256(packed >> 128));
        d = uint64(uint256(packed >> 192));
    }

    /**
     * @notice Pack message lengths array into bytes32 for storage optimization.
     * @param messageLengths Array of message lengths (uint256[])
     * @return packed Packed bytes32 containing the first 4 lengths as uint64s
     */
    function packStorage(uint256[] memory messageLengths) internal pure returns (bytes32 packed) {
        uint256 len = messageLengths.length;
        uint256 maxPack = len < 4 ? len : 4;
        
        unchecked {
            for (uint256 i = 0; i < maxPack; ++i) {
                // Convert to uint64 (truncate if necessary) and pack
                uint64 length64 = uint64(messageLengths[i]);
                packed |= bytes32(uint256(length64) << (i * 64));
            }
        }
    }

    /**
     * @notice Overload accepting uint64[] directly (avoids widening then truncating).
     * @param messageLengths Array of message lengths (uint64[])
     * @return packed Packed bytes32 containing the first 4 lengths
     */
    function packStorage(uint64[] memory messageLengths) internal pure returns (bytes32 packed) {
        uint256 len = messageLengths.length;
        uint256 maxPack = len < 4 ? len : 4;
        unchecked {
            for (uint256 i = 0; i < maxPack; ++i) {
                packed |= bytes32(uint256(messageLengths[i]) << (i * 64));
            }
        }
    }
}

/**
 * @dev Helper wrapper so we can keep a calldata array without brittle inline assembly.
 * Using a struct parameter avoids accidental misuse and keeps signatures distinct.
 */
struct bytes64Array {
    uint64[] arr;
}
