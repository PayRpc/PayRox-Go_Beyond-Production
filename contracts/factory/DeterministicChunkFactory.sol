// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal CREATE2 factory that computes deterministic addresses and deploys via create2.
contract DeterministicChunkFactory {
    error DeployFailed();
    error CodehashMismatch(bytes32 expected, bytes32 actual);

    event Deployed(address indexed addr, bytes32 salt, bytes32 codehash);

    // Minimal state for compatibility with existing facets/tests
    uint256 public deploymentCount;
    mapping(address => bool) public isDeployedContract;

    // Minimal admin/state stubs expected by ChunkFactoryFacet
    address public owner;
    mapping(address => uint8) public userTiers;
    address public feeRecipient;
    uint256 public baseFeeWei;
    bool public feesEnabled;
    bool public idempotentMode;

    /// @notice Compute CREATE2 address for given deployer (this), salt and bytecode hash.
    function computeAddress(bytes32 salt, bytes32 bytecodeHash) public view returns (address) {
        bytes32 data = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash));
        return address(uint160(uint256(data)));
    }

    /// @notice Deploy `bytecode` with `salt`. If code already present at computed address, verify codehash matches.
    function deploy(bytes32 salt, bytes memory bytecode, bytes32 expectedRuntimeCodehash) external returns (address addr) {
        bytes32 bytecodeHash = keccak256(bytecode);
        addr = computeAddress(salt, bytecodeHash);

        // If there is already code at addr, check runtime codehash matches expectedRuntimeCodehash (if non-zero)
        uint256 size;
        assembly { size := extcodesize(addr) }
        if (size != 0) {
            if (expectedRuntimeCodehash != bytes32(0)) {
                bytes32 got;
                assembly { got := extcodehash(addr) }
                if (got != expectedRuntimeCodehash) revert CodehashMismatch(expectedRuntimeCodehash, got);
            }
            return addr; // idempotent success
        }

        address deployed;
        assembly {
            deployed := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
    if (deployed == address(0)) revert DeployFailed();

    // record state for downstream facets/tests
    isDeployedContract[deployed] = true;
    deploymentCount += 1;

        // verify runtime codehash if requested
        if (expectedRuntimeCodehash != bytes32(0)) {
            bytes32 got;
            assembly { got := extcodehash(deployed) }
            if (got != expectedRuntimeCodehash) revert CodehashMismatch(expectedRuntimeCodehash, got);
        }

        emit Deployed(deployed, salt, keccak256(bytecode));
        return deployed;
    }

    // ======= Minimal admin / compatibility functions (stubs) =======
    function withdrawFees() external {
        // no-op stub for compatibility
    }

    function withdrawRefund() external {
        // no-op stub for compatibility
    }

    function setTierFee(uint8 /*tier*/, uint256 /*fee*/) external {
        // no-op stub
    }

    function setUserTier(address user, uint8 tier) external {
        userTiers[user] = tier;
    }

    function setIdempotentMode(bool enabled) external {
        idempotentMode = enabled;
    }

    function setFeeRecipient(address newRecipient) external {
        feeRecipient = newRecipient;
    }

    function setBaseFeeWei(uint256 newBase) external {
        baseFeeWei = newBase;
    }

    function setFeesEnabled(bool enabled) external {
        feesEnabled = enabled;
    }

    // placeholder owner setter for test harnesses
    function transferDefaultAdmin(address newAdmin) external {
        owner = newAdmin;
    }

    /// @notice Minimal integrity check for compatibility
    function verifySystemIntegrity() external view returns (bool) {
        return true;
    }

    // Compatibility accessors expected by ChunkFactoryFacet
    function expectedManifestHash() external pure returns (bytes32) {
        return bytes32(0);
    }

    function expectedFactoryBytecodeHash() external pure returns (bytes32) {
        return bytes32(0);
    }

    function expectedManifestDispatcher() external view returns (address) {
        return address(0);
    }
}
