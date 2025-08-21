// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IChunkFactory} from "../interfaces/IChunkFactory.sol";
import {IManifestDispatcher} from "../interfaces/IManifestDispatcher.sol";

/**
 * @title Orchestrator
 * @notice Coordinates ChunkFactory staging and ManifestDispatcher route updates/activation.
 * @dev Grant this contract COMMIT/APPLY/EMERGENCY roles on the ManifestDispatcher.
 */
contract Orchestrator is ReentrancyGuard {
    /* ───────────────────────── Events ───────────────────────── */
    event OrchestrationStarted(bytes32 indexed id, address indexed initiator, uint256 timestamp);
    event ChunksStaged(bytes32 indexed id, uint256 count, uint256 gasUsed, uint256 feePaid);
    event ComponentNoted(bytes32 indexed id, address indexed component, string tag);
    event OrchestrationCompleted(bytes32 indexed id, bool success);
    event EmergencyPause(bool paused, address admin);
    event PlanEmergencyPause(bytes32 indexed id, bool paused);

    /* ──────────────────────── Storage ───────────────────────── */
    struct Plan {
        address initiator;
        uint256 gasLimit;   // upper bound for a single step (0 = disabled)
        bool    completed;
    }

    IChunkFactory       public immutable factory;
    IManifestDispatcher public immutable dispatcher;

    address public immutable admin;
    mapping(bytes32 => Plan) public plans;
    mapping(address => bool) public authorized;

    // Emergency pause
    mapping(bytes32 => bool) public emergencyPaused; // per-plan
    bool public globalEmergencyPause;

    /* ──────────────────────── Errors ───────────────────────── */
    error NotAdmin();
    error NotAuthorized();
    error PlanExists();
    error PlanMissing();
    error PlanDone();
    error BadId();
    error BadGas();
    error EmergencyPaused();
    error GasExceeded(uint256 used, uint256 limit);
    error ZeroAddress();

    /* ───────────────────── Modifiers ───────────────────────── */
    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAuth() {
        if (!authorized[msg.sender] && msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier planActive(bytes32 id) {
        Plan storage p = plans[id];
        if (p.initiator == address(0)) revert PlanMissing();
        if (p.completed)               revert PlanDone();
        if (globalEmergencyPause || emergencyPaused[id]) revert EmergencyPaused();
        _;
    }

    /* ───────────────────── Constructor ─────────────────────── */
    constructor(IChunkFactory _factory, IManifestDispatcher _dispatcher) {
        if (address(_factory) == address(0) || address(_dispatcher) == address(0)) revert ZeroAddress();
        factory    = _factory;
        dispatcher = _dispatcher;
        admin      = msg.sender;
        authorized[msg.sender] = true;
    }

    /* ───────────────── Governance ──────────────────────────── */
    function setAuthorized(address who, bool ok) external onlyAdmin {
        authorized[who] = ok;
    }

    function setGlobalEmergencyPause(bool paused) external onlyAdmin {
        globalEmergencyPause = paused;
        emit EmergencyPause(paused, msg.sender);
    }

    function setPlanEmergencyPause(bytes32 id, bool paused) external onlyAdmin {
        // Creating a pause flag for a non-existent plan is harmless; it will be ignored once plan exists.
        emergencyPaused[id] = paused;
        emit PlanEmergencyPause(id, paused);
    }

    /* ───────────────── Orchestration API ───────────────────── */

    /// @notice Start a plan (gated by emergency pause).
    function startOrchestration(bytes32 id, uint256 gasLimit) external onlyAuth {
        if (globalEmergencyPause || emergencyPaused[id]) revert EmergencyPaused();
        _start(id, gasLimit);
    }

    /// @notice Same as startOrchestration; kept for compatibility.
    function startOrchestrationSecure(bytes32 id, uint256 gasLimit) external onlyAuth {
        if (globalEmergencyPause || emergencyPaused[id]) revert EmergencyPaused();
        _start(id, gasLimit);
    }

    function _start(bytes32 id, uint256 gasLimit) internal {
        if (id == bytes32(0)) revert BadId();
        if (gasLimit == 0)     revert BadGas();
        if (plans[id].initiator != address(0)) revert PlanExists();

        plans[id] = Plan({ initiator: msg.sender, gasLimit: gasLimit, completed: false });
        emit OrchestrationStarted(id, msg.sender, block.timestamp);
    }

    /// @notice Stage a batch of content-addressed chunks via the factory.
    /// @dev Forwards msg.value to the factory; reverts on gas overage to preserve atomicity.
    function orchestrateStageBatch(bytes32 id, bytes[] calldata blobs)
        external
        payable
        onlyAuth
        planActive(id)
        nonReentrant
        returns (address[] memory chunks, bytes32[] memory hashes)
    {
        uint256 g0 = gasleft();
        (chunks, hashes) = factory.stageBatch{value: msg.value}(blobs);
        uint256 used = g0 - gasleft();

        uint256 limit = plans[id].gasLimit;
        if (limit != 0 && used > limit) revert GasExceeded(used, limit);

        emit ChunksStaged(id, blobs.length, used, msg.value);

        // Optional: note each component for off-chain indexing
        for (uint256 i; i < chunks.length; ) {
            emit ComponentNoted(id, chunks[i], "chunk");
            unchecked { ++i; }
        }
    }

    /// @notice Convenience: stage a single blob.
    function orchestrateStage(bytes32 id, bytes calldata data)
        external
        payable
        onlyAuth
        planActive(id)
        nonReentrant
        returns (address chunk, bytes32 hash)
    {
        uint256 g0 = gasleft();
        (chunk, hash) = factory.stage{value: msg.value}(data);
        uint256 used = g0 - gasleft();

        uint256 limit = plans[id].gasLimit;
        if (limit != 0 && used > limit) revert GasExceeded(used, limit);

        emit ChunksStaged(id, 1, used, msg.value);
        emit ComponentNoted(id, chunk, "chunk");
    }

    /// @notice Commit a new manifest root/epoch on the dispatcher.
    function orchestrateCommitRoot(bytes32 id, bytes32 newRoot, uint64 newEpoch)
        external
        onlyAuth
        planActive(id)
        nonReentrant
    {
        dispatcher.commitRoot(newRoot, newEpoch);
    }

    /// @notice Apply routes (proofs verified inside dispatcher).
    function orchestrateManifestUpdate(
        bytes32 id,
        bytes4[] calldata selectors,
        address[] calldata facets,
        bytes32[] calldata codehashes,
        bytes32[][] calldata proofs,
        bool[][] calldata isRight
    ) external onlyAuth planActive(id) nonReentrant {
        dispatcher.applyRoutes(selectors, facets, codehashes, proofs, isRight);
    }

    /// @notice Emergency removal of routes via dispatcher (kept minimal).
    function orchestrateRemoveRoutes(bytes32 id, bytes4[] calldata selectors)
        external
        onlyAuth
        planActive(id)
        nonReentrant
    {
        dispatcher.removeRoutes(selectors);
    }

    /// @notice Activate committed root when dispatcher delay has elapsed.
    function activateCommittedRoot(bytes32 id)
        external
        onlyAuth
        planActive(id)
        nonReentrant
    {
        dispatcher.activateCommittedRoot();
    }

    /// @notice Mark orchestration complete (allowed even during emergency pause).
    function complete(bytes32 id, bool success) external onlyAuth {
        Plan storage p = plans[id];
        if (p.initiator == address(0)) revert PlanMissing();
        if (p.completed)               revert PlanDone();

        p.completed = true;
        emit OrchestrationCompleted(id, success);
    }

    /// @notice Note a component (subject to emergency pause).
    function noteComponent(bytes32 id, address component, string calldata tag)
        external
        onlyAuth
        planActive(id)
    {
        emit ComponentNoted(id, component, tag);
    }

    /* ───────────────── Views / Helpers ─────────────────────── */

    function getPlan(bytes32 id) external view returns (address initiator, uint256 gasLimit, bool completed) {
        Plan storage p = plans[id];
        return (p.initiator, p.gasLimit, p.completed);
    }

    function isPlanActive(bytes32 id) external view returns (bool) {
        Plan storage p = plans[id];
        return p.initiator != address(0) && !p.completed && !(globalEmergencyPause || emergencyPaused[id]);
    }

    function isAuthorized(address who) external view returns (bool) {
        return authorized[who] || who == admin;
    }

    function getIntegrationAddresses() external view returns (address factoryAddr, address dispatcherAddr) {
        return (address(factory), address(dispatcher));
    }

    /// @notice Validate orchestration parameters before execution (read-only).
    function validateOrchestration(bytes32 id, uint256 gasLimit, address initiator)
        external
        view
        returns (bool isValid, string memory reason)
    {
        if (id == bytes32(0)) return (false, "Invalid ID");
        if (gasLimit == 0)    return (false, "Invalid gas limit");
        if (!authorized[initiator] && initiator != admin) return (false, "Not authorized");
        if (plans[id].initiator != address(0)) return (false, "Plan already exists");
        if (globalEmergencyPause || emergencyPaused[id]) return (false, "Emergency paused");
        return (true, "Valid");
    }

    /* ───────────────── ETH Safety ──────────────────────────── */

    /// @dev Prevent stray ETH transfers.
    receive() external payable {
        revert("No direct ETH");
    }

    /// @notice Admin sweep in case ETH is ever stranded (e.g., selfdestruct refunds).
    function sweep(address payable to) external onlyAdmin {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = address(this).balance;
        if (bal == 0) return;
        (bool ok, ) = to.call{value: bal}("");
        require(ok, "sweep failed");
    }
}
