import { encodeLeaf } from "../scripts/utils/merkle";
import { processOrderedProof } from "../scripts/utils/ordered-merkle";
import { expect } from "chai";
import { ethers } from "hardhat";

// Minimal synthetic roundtrip: build a tiny ordered tree of 2 leaves and verify root matches.

describe("Ordered Merkle (2-leaf) roundtrip", () => {
  it("computes identical root via processOrderedProof", () => {
    // Two synthetic leaves (selector bytes4, facet address, codehash bytes32)
    const _selA = "0xaaaaaaaa";
    const _selB = "0xbbbbbbbb";
    const _facet = "0x0000000000000000000000000000000000000001";
    const _codehash = "0x" + "11".repeat(32);

    const _leafHashA = encodeLeaf(_selA, _facet, _codehash);
    const _leafHashB = encodeLeaf(_selB, _facet, _codehash);

    // _hashLeaf = keccak256(0x00 || leaf)
    const { keccak256, concat } = ethers;
    const _leafNodeA = keccak256(concat(["0x00", _leafHashA]));
    const _leafNodeB = keccak256(concat(["0x00", _leafHashB]));

    // _hashNode(left,right) = keccak256(0x01||left||right)
    const _root = keccak256(concat(["0x01", _leafNodeA, _leafNodeB]));

    // Proof for left leaf: sibling is right child => positions bit 0 = 1
    const _proof = [_leafNodeB];
    const _positionsHex = "0x01";

    const _recomputed = processOrderedProof(_leafHashA, _proof, _positionsHex);
    expect(_recomputed.toLowerCase()).to.equal(_root.toLowerCase());
  });
});
