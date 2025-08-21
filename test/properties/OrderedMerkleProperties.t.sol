// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import {OrderedMerkle} from "../../contracts/utils/OrderedMerkle.sol";

/**
 * @title OrderedMerkle Property Tests
 * @notice Property-based tests for OrderedMerkle verification functions
 * @dev Tests equivalence between legacy bool[] and new bitfield implementations
 */
contract OrderedMerkleProperties is Test {
    
    /**
     * @notice Property A: Bitfield and bool array verification should be equivalent
     * @dev verify(leaf, proof, bitfield, root) == verify(proof, bools, root, leaf)
     */
    function test_prop_equivalence(
        bytes32 leaf, 
        bytes32[] memory proof, 
        bool[] memory directions, 
        bytes32 root
    ) public pure {
        // Bound input size to reasonable limits
        vm.assume(proof.length == directions.length);
        vm.assume(proof.length <= 32); // Max depth for practical Merkle trees
        vm.assume(proof.length > 0);   // Need at least one proof element
        
        // Convert bool array to bitfield position
        uint256 position = 0;
        for (uint i = 0; i < directions.length; i++) {
            if (directions[i]) {
                position |= (1 << i);
            }
        }
        
        // Test equivalence of both verification methods
        bool resultBitfield = OrderedMerkle.verify(leaf, proof, position, root);
        bool resultBoolArray = OrderedMerkle.verify(proof, directions, root, leaf);
        
        assertEq(
            resultBitfield, 
            resultBoolArray, 
            "Bitfield and bool array verification should be equivalent"
        );
    }

    /**
     * @notice Property B: Masking high bits beyond proof length shouldn't change result
     * @dev Extra bits in position beyond proof.length should not affect verification
     */
    function test_prop_highBitMasking(
        bytes32 leaf,
        bytes32[] memory proof,
        uint256 position,
        bytes32 root,
        uint256 extraBits
    ) public pure {
        vm.assume(proof.length > 0 && proof.length <= 16); // Reasonable bounds
        vm.assume(extraBits > 0);
        
        // Mask position to only use bits within proof length
        uint256 maskedPosition = position & ((1 << proof.length) - 1);
        
        // Add extra high bits that should be ignored
        uint256 positionWithExtra = maskedPosition | (extraBits << proof.length);
        
        bool resultMasked = OrderedMerkle.verify(leaf, proof, maskedPosition, root);
        bool resultWithExtra = OrderedMerkle.verify(leaf, proof, positionWithExtra, root);
        
        assertEq(
            resultMasked,
            resultWithExtra,
            "High bits beyond proof length should not affect verification"
        );
    }

    /**
     * @notice Property C: Flipping any sibling should flip the verification result
     * @dev For valid proofs, changing any proof element should break verification
     * Note: This only applies when the original verification would succeed
     */
    function test_prop_siblingFlip(
        bytes32 leaf,
        bytes32[] memory proof,
        uint256 position,
        bytes32 root,
        uint8 flipIndex
    ) public pure {
        vm.assume(proof.length > 0 && proof.length <= 8); // Keep small for gas
        vm.assume(flipIndex < proof.length);
        vm.assume(proof[flipIndex] != bytes32(0)); // Avoid edge case of flipping to same value
        
        // Get original result
        bool originalResult = OrderedMerkle.verify(leaf, proof, position, root);
        
        // Only test if original verification would pass
        if (!originalResult) return;
        
        // Create modified proof with one sibling flipped
        bytes32[] memory modifiedProof = new bytes32[](proof.length);
        for (uint i = 0; i < proof.length; i++) {
            modifiedProof[i] = proof[i];
        }
        
        // Flip the target sibling (XOR with non-zero value)
        modifiedProof[flipIndex] = bytes32(uint256(proof[flipIndex]) ^ 1);
        
        bool modifiedResult = OrderedMerkle.verify(leaf, modifiedProof, position, root);
        
        assertFalse(
            modifiedResult,
            "Flipping a sibling should break verification for valid proofs"
        );
    }

    /**
     * @notice Property D: Position bits beyond proof length should be ignored
     * @dev Setting high bits in position should not affect verification
     */
    function test_prop_positionBounds(
        bytes32 leaf,
        bytes32[] memory proof,
        uint256 position,
        bytes32 root
    ) public pure {
        vm.assume(proof.length > 0 && proof.length <= 20);
        
        // Create a position with high bits set
        uint256 maskedPosition = position & ((1 << proof.length) - 1);
        uint256 highBitsPosition = maskedPosition | (type(uint256).max << proof.length);
        
        bool resultMasked = OrderedMerkle.verify(leaf, proof, maskedPosition, root);
        bool resultHighBits = OrderedMerkle.verify(leaf, proof, highBitsPosition, root);
        
        assertEq(
            resultMasked,
            resultHighBits,
            "High bits in position should be ignored"
        );
    }

    /**
     * @notice Property E: Empty proof should handle edge case correctly
     * @dev Test behavior with zero-length proof arrays
     */
    function test_prop_emptyProof(bytes32 leaf, bytes32 root) public pure {
        bytes32[] memory emptyProof = new bytes32[](0);
        bool[] memory emptyDirections = new bool[](0);
        
        // Both methods should handle empty proofs consistently
        bool resultBitfield = OrderedMerkle.verify(leaf, emptyProof, 0, root);
        bool resultBoolArray = OrderedMerkle.verify(emptyProof, emptyDirections, root, leaf);
        
        assertEq(
            resultBitfield,
            resultBoolArray,
            "Empty proof handling should be consistent"
        );
        
        // For empty proof, leaf should equal root for verification to pass
        if (leaf == root) {
            assertTrue(resultBitfield, "Empty proof should pass when leaf equals root");
        } else {
            assertFalse(resultBitfield, "Empty proof should fail when leaf != root");
        }
    }

    /**
     * @notice Test concrete example for regression testing
     * @dev Ensure known good cases continue to work
     */
    function test_concreteExample() public pure {
        // Simple two-element tree: keccak256(abi.encodePacked(0x01, left, right))
        bytes32 left = keccak256("left");
        bytes32 right = keccak256("right");
        bytes32 root = keccak256(abi.encodePacked(hex"01", left, right));
        
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = right;
        
        // Verify left leaf (position 0 = left side)
        bool result = OrderedMerkle.verify(left, proof, 0, root);
        assertTrue(result, "Known good example should verify");
        
        // Verify right leaf (position 1 = right side)  
        proof[0] = left;
        result = OrderedMerkle.verify(right, proof, 1, root);
        assertTrue(result, "Known good example should verify");
    }
}
