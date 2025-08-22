// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IManifestDispatcher, IManifestDispatcherView} from "../interfaces/IManifestDispatcher.sol";

/// @notice Minimal, production-oriented ManifestDispatcher implementing commit/apply lifecycle,
/// route table with codehash pinning, activation delay, pause/freeze, and loupe view.
contract ManifestDispatcher is IManifestDispatcher, IManifestDispatcherView {
    // Namespaced storage slot to avoid collisions
    bytes32 private constant DISPATCHER_SLOT = keccak256("payrox.manifest.dispatcher.v1");

    // Use interface Route type to avoid duplicate declaration
    struct DispatcherStorage {
        address owner;
        bool paused;
        bool frozen;
        uint64 activationDelay; // seconds

        // committed/active roots
        bytes32 pendingRoot;
        uint64 pendingEpoch;
        uint64 pendingSince;

        bytes32 activeRoot;
        uint64 activeEpoch;

        // selector -> Route
        mapping(bytes4 => Route) routes;
    }

    function _s() private pure returns (DispatcherStorage storage ds) {
        bytes32 p = DISPATCHER_SLOT;
        assembly { ds.slot := p }
    }

    // Errors
    error NotOwner();
    error Paused();
    error FrozenState();
    error ActivationDelayNotElapsed(uint64 needUntil, uint64 nowAt);
    error DispatcherCodehashMismatch(bytes32 expected, bytes32 actual);
    error LengthMismatch();

    // Events are declared in the interface; reuse them

    modifier onlyOwner() {
        if (msg.sender != _s().owner) revert NotOwner();
        _;
    }

    modifier notPaused() {
        if (_s().paused) revert Paused();
        _;
    }

    modifier notFrozen() {
        if (_s().frozen) revert FrozenState();
        _;
    }

    /// @notice Initialize owner and sane defaults. Can be called once.
    function initialize(address owner_) external {
        DispatcherStorage storage ds = _s();
        require(ds.owner == address(0), "Already initialized");
        ds.owner = owner_ == address(0) ? msg.sender : owner_;
        ds.activationDelay = 1; // default 1s for tests; operators should increase in prod
        ds.paused = false;
        ds.frozen = false;
    }

    // Read-only views
    function routes(bytes4 selector) external view override(IManifestDispatcher, IManifestDispatcherView) returns (address facet, bytes32 codehash) {
        Route storage r = _s().routes[selector];
        return (r.facet, r.codehash);
    }

    function pendingRoot() external view override returns (bytes32) { return _s().pendingRoot; }
    function pendingEpoch() external view override returns (uint64) { return _s().pendingEpoch; }
    function pendingSince() external view override returns (uint64) { return _s().pendingSince; }
    function activeRoot() external view override(IManifestDispatcher, IManifestDispatcherView) returns (bytes32) { return _s().activeRoot; }
    function activeEpoch() external view override returns (uint64) { return _s().activeEpoch; }
    function activationDelay() external view override returns (uint64) { return _s().activationDelay; }
    function frozen() external view override(IManifestDispatcher, IManifestDispatcherView) returns (bool) { return _s().frozen; }

    // Governance
    function commitRoot(bytes32 newRoot, uint64 newEpoch) external override onlyOwner notFrozen {
        DispatcherStorage storage ds = _s();
        ds.pendingRoot = newRoot;
        ds.pendingEpoch = newEpoch;
        ds.pendingSince = uint64(block.timestamp);
        emit RootCommitted(newRoot, newEpoch);
    }

    /// @notice Apply routes arrays. Proofs/isRight are accepted for API compatibility but ignored in this minimal implementation.
    function applyRoutes(
        bytes4[] calldata selectors,
        address[] calldata facets,
        bytes32[] calldata codehashes,
        bytes32[][] calldata, /* proofs */
        bool[][] calldata /* isRight */
    ) external override onlyOwner notFrozen notPaused {
        if (selectors.length != facets.length || selectors.length != codehashes.length) revert LengthMismatch();
        DispatcherStorage storage ds = _s();
        for (uint256 i = 0; i < selectors.length; ++i) {
            // If a codehash is provided (non-zero) ensure facet has matching extcodehash
            bytes32 expected = codehashes[i];
            if (expected != bytes32(0)) {
                address f = facets[i];
                bytes32 got;
                assembly { got := extcodehash(f) }
                if (got != expected) revert DispatcherCodehashMismatch(expected, got);
            }
            ds.routes[selectors[i]] = Route({ facet: facets[i], codehash: codehashes[i] });
            emit RouteAdded(selectors[i], facets[i], codehashes[i]);
        }
    }

    function activateCommittedRoot() external override onlyOwner notFrozen {
        DispatcherStorage storage ds = _s();
        require(ds.pendingRoot != bytes32(0), "No pending root");
        uint64 need = ds.pendingSince + ds.activationDelay;
        if (uint64(block.timestamp) < need) revert ActivationDelayNotElapsed(need, uint64(block.timestamp));
        ds.activeRoot = ds.pendingRoot;
        ds.activeEpoch = ds.pendingEpoch;
        emit RootActivated(ds.activeRoot, ds.activeEpoch);
        ds.pendingRoot = bytes32(0);
        ds.pendingEpoch = 0;
        ds.pendingSince = 0;
    }

    function removeRoutes(bytes4[] calldata selectors) external override onlyOwner notFrozen notPaused {
        DispatcherStorage storage ds = _s();
        for (uint256 i = 0; i < selectors.length; ++i) {
            delete ds.routes[selectors[i]];
            emit RouteRemoved(selectors[i]);
        }
    }

    function setActivationDelay(uint64 newDelay) external override onlyOwner notFrozen {
        DispatcherStorage storage ds = _s();
        emit ActivationDelaySet(ds.activationDelay, newDelay);
        ds.activationDelay = newDelay;
    }

    function freeze() external override onlyOwner notFrozen {
        _s().frozen = true;
        emit Frozen();
    }

    // Convenience: pause to block configuration changes during incident response
    function setPaused(bool p) external onlyOwner {
        _s().paused = p;
    }

    function getManifestInfo() external view override returns (IManifestDispatcher.ManifestInfo memory info) {
        DispatcherStorage storage ds = _s();
        info.hash = ds.activeRoot;
        info.version = ds.activeEpoch;
        info.timestamp = ds.activeEpoch == 0 ? 0 : uint64(block.timestamp);
        info.selectorCount = 0; // not tracked in this minimal implementation
    }
}
