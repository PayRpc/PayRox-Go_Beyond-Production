// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title MinimalFacet
 * @notice Minimal facet example for PayRox Diamond Pattern
 * @dev Demonstrates basic facet structure with ERC-165 support
 */
contract MinimalFacet {
    /* ───────────────────────────── Errors ───────────────────────────── */
    error ZeroAddress();
    error NotAuthorized();

    /* ───────────────────────────── Events ───────────────────────────── */
    event MinimalOperation(address indexed caller, uint256 value);

    /* ───────────────────────────── Storage ───────────────────────────── */
    bytes32 private constant MINIMAL_STORAGE_SLOT = keccak256("payrox.facets.minimal.v1");

    struct MinimalStorage {
        uint256 value;
        address lastCaller;
        bool initialized;
    }

    function _storage() private pure returns (MinimalStorage storage s) {
        bytes32 slot = MINIMAL_STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }

    /* ───────────────────────────── Functions ───────────────────────────── */

    /**
     * @notice Initialize the minimal facet
     * @param initialValue The initial value to set
     */
    function initializeMinimal(uint256 initialValue) external {
        MinimalStorage storage s = _storage();
        if (s.initialized) revert NotAuthorized();

        s.value = initialValue;
        s.lastCaller = msg.sender;
        s.initialized = true;

        emit MinimalOperation(msg.sender, initialValue);
    }

    /**
     * @notice Set a new value
     * @param newValue The new value to set
     */
    function setValue(uint256 newValue) external {
        MinimalStorage storage s = _storage();
        s.value = newValue;
        s.lastCaller = msg.sender;

        emit MinimalOperation(msg.sender, newValue);
    }

    /**
     * @notice Get the current value
     * @return The current stored value
     */
    function getValue() external view returns (uint256) {
        return _storage().value;
    }

    /**
     * @notice Get the last caller
     * @return The address of the last caller
     */
    function getLastCaller() external view returns (address) {
        return _storage().lastCaller;
    }

    /* ───────────────────────── ERC-165 Support ─────────────────────────── */

    /**
     * @notice Check if contract supports an interface
     * @param interfaceId The interface identifier
     * @return True if supported
     */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7; // ERC165
    }

    /* ───────────────────────── Facet Metadata ─────────────────────────── */

    /**
     * @notice Get facet information for manifest tooling
     * @return name The facet name
     * @return version The facet version
     * @return selectors Array of function selectors
     */
    function getFacetInfo()
        external
        pure
        returns (string memory name, string memory version, bytes4[] memory selectors)
    {
        name = "MinimalFacet";
        version = "1.0.0";
        selectors = new bytes4[](6);
        selectors[0] = this.initializeMinimal.selector;
        selectors[1] = this.setValue.selector;
        selectors[2] = this.getValue.selector;
        selectors[3] = this.getLastCaller.selector;
        selectors[4] = this.supportsInterface.selector;
        selectors[5] = this.getFacetInfo.selector;
    }
}
