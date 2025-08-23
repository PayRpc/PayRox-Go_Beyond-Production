// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title IDispatcherIndexView
 * @notice Interface for reading dispatcher's facet/selector index
 */
interface IDispatcherIndexView {
    function listFacets() external view returns (address[] memory);
    function listSelectors(address facet) external view returns (bytes4[] memory);
    function route(bytes4 sel) external view returns (address facet, bytes32 codehash);

    // Extended metadata
    function facetVersionTag(address facet) external view returns (bytes32);
    function facetSecurityLevel(address facet) external view returns (uint8);
    function facetProvenanceOf(address facet) external view returns (address deployer, uint256 timestamp);
    function facetMetadataOf(address facet) external view returns (
        string memory name,
        string memory category,
        string[] memory dependencies,
        bool isUpgradeable
    );
}
