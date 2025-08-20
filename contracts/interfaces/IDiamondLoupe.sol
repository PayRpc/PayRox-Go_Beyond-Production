// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title IDiamondLoupe (EIP-2535 standard)
 * @notice Canonical loupe interface kept 100% compatible with ecosystem tooling.
 * @dev Do not change names/signatures. Implement this alongside your enhanced loupe.
 */
interface IDiamondLoupe {
    /// @notice Facet tuple as defined by EIP-2535
    struct Facet {
        address facetAddress;
        bytes4[] functionSelectors;
    }

    /**
     * @notice Get all facet addresses and their selectors.
     * @return facets_ Array of all facet info
     */
    function facets() external view returns (Facet[] memory facets_);

    /**
     * @notice Get all function selectors supported by a facet.
     * @param facet The facet address
     * @return selectors_ List of function selectors
     */
    function facetFunctionSelectors(address facet) external view returns (bytes4[] memory selectors_);

    /**
     * @notice Get all facet addresses.
     * @return addresses_ List of facet addresses
     */
    function facetAddresses() external view returns (address[] memory addresses_);

    /**
     * @notice Get the facet address that supports a given selector.
     * @param selector The function selector
     * @return facet_ The facet address or address(0) if none
     */
    function facetAddress(bytes4 selector) external view returns (address facet_);
}
