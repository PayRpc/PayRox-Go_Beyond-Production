/**
 * Ordered Merkle Tree Builder with Domain Separation
 * Builds position-aware proofs compatible with on-chain OrderedMerkle verification
 */

import { ethers } from "ethers";
import fs from "fs";

export interface RouteLeaf {
  selector: string; // 4-byte hex
  facet: string; // address
  codehash: string; // 32-byte hex
  leafHash?: string; // computed leaf hash
  index?: number; // position in ordered array
}

export interface MerkleProof {
  selector: string;
  facet: string;
  codehash: string;
  proof: string[]; // Array of sibling hashes
  positions: bigint; // Bitfield for left/right positions
  leafIndex: number;
}

export interface OrderedMerkleTree {
  root: string;
  leaves: RouteLeaf[];
  proofs: Map<string, MerkleProof>;
  levels: string[][]; // All tree levels for debugging
  leafOrder: "selector-asc"; // Deterministic ordering strategy
}

export interface ManifestRoot {
  chainId: number;
  epoch: number;
  root: string;
  solc: string;
  optimizer: { enabled: boolean; runs: number };
  metadata: "none";
  leafOrder: "selector-asc";
  leaves: number;
  buildHash: string;
  timestamp: string;
}

export class OrderedMerkleBuilder {
  // Domain separation tags (must match on-chain contract)
  private readonly LEAF_DOMAIN_TAG = 0x00;
  private readonly NODE_DOMAIN_TAG = 0x01;

  // Store current leaves for proof generation
  private currentLeaves: RouteLeaf[] = [];

  constructor() {}

  /**
   * Apply leaf domain separation: keccak256(0x00 || leaf)
   */
  private leafDomain(leaf: string): string {
    const leafBytes = ethers.getBytes(leaf);
    const domainBytes = new Uint8Array([this.LEAF_DOMAIN_TAG, ...leafBytes]);
    return ethers.keccak256(domainBytes);
  }

  /**
   * Apply node domain separation: keccak256(0x01 || left || right)
   */
  private nodeDomain(left: string, right: string): string {
    const leftBytes = ethers.getBytes(left);
    const rightBytes = ethers.getBytes(right);
    const domainBytes = new Uint8Array([this.NODE_DOMAIN_TAG, ...leftBytes, ...rightBytes]);
    return ethers.keccak256(domainBytes);
  }

  /**
   * Compute route leaf hash: keccak256(abi.encode(selector, facet, codehash))
   */
  private computeRouteLeaf(selector: string, facet: string, codehash: string): string {
    // Ensure proper formatting
    if (!selector.startsWith("0x")) selector = "0x" + selector;
    if (!facet.startsWith("0x")) facet = "0x" + facet;
    if (!codehash.startsWith("0x")) codehash = "0x" + codehash;

    // Validate inputs
    if (selector.length !== 10) throw new Error(`Invalid selector length: ${selector}`);
    if (facet.length !== 42) throw new Error(`Invalid facet address length: ${facet}`);
    if (codehash.length !== 66) throw new Error(`Invalid codehash length: ${codehash}`);

    // Use ethers ABI encoding for exact match with Solidity
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes4", "address", "bytes32"],
      [selector, ethers.getAddress(facet), codehash]
    );

    return ethers.keccak256(encoded);
  }

  /**
   * Build ordered Merkle tree from route leaves
   */
  buildTree(leaves: RouteLeaf[]): OrderedMerkleTree {
    if (leaves.length === 0) {
      throw new Error("Cannot build Merkle tree with no leaves");
    }

    // Step 1: Sort leaves by selector (ascending) for deterministic ordering
    const orderedLeaves = [...leaves].sort((a, b) => a.selector.localeCompare(b.selector));

    // Store ordered leaves for proof generation
    this.currentLeaves = orderedLeaves;

    // Step 2: Compute leaf hashes and apply leaf domain separation
    for (let i = 0; i < orderedLeaves.length; i++) {
      const leaf = orderedLeaves[i];
      if (!leaf) {
        throw new Error(`Missing leaf at index ${i}`);
      }
      const routeLeaf = this.computeRouteLeaf(leaf.selector, leaf.facet, leaf.codehash);
      leaf.leafHash = this.leafDomain(routeLeaf);
      leaf.index = i;
    }

    // Step 3: Build tree bottom-up with domain separation
    const levels: string[][] = [];
    let currentLevel = orderedLeaves.map(leaf => leaf.leafHash!);
    levels.push([...currentLevel]);

    // Build tree levels
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // Duplicate for odd count

        if (!left) {
          throw new Error(`Missing left node at index ${i}`);
        }
        if (!right) {
          throw new Error(`Missing right node at index ${i + 1}`);
        }

        const parentHash = this.nodeDomain(left, right);
        nextLevel.push(parentHash);
      }

      currentLevel = nextLevel;
      levels.push([...nextLevel]);
    }

    const root = currentLevel[0];
    if (!root) {
      throw new Error("Failed to generate Merkle root");
    }

    // Step 4: Generate proofs for each leaf
    const proofs = new Map<string, MerkleProof>();

    for (const leaf of orderedLeaves) {
      const proof = this.generateProof(leaf.index!, levels);
      proofs.set(leaf.selector, proof);
    }

    return {
      root,
      leaves: orderedLeaves,
      proofs,
      levels,
      leafOrder: "selector-asc"
    };
  }

  /**
   * Generate Merkle proof for a specific leaf index
   */
  private generateProof(leafIndex: number, levels: string[][]): MerkleProof {
    if (levels.length === 0) {
      throw new Error("Empty tree levels");
    }

    const firstLevel = levels[0];
    if (!firstLevel) {
      throw new Error("Missing first level in tree");
    }

    const leaf = firstLevel[leafIndex];
    if (!leaf) {
      throw new Error(`Invalid leaf index: ${leafIndex}`);
    }

    const proof: string[] = [];
    let positions = 0n;
    let currentIndex = leafIndex;

    // Walk up the tree, collecting sibling hashes
    for (let level = 0; level < levels.length - 1; level++) {
      const currentLevelNodes = levels[level];
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

      // Get sibling hash (duplicate last node if odd count)
      let siblingHash: string;
      if (currentLevelNodes && siblingIndex < currentLevelNodes.length) {
        const sibling = currentLevelNodes[siblingIndex];
        if (!sibling) {
          throw new Error(`Missing sibling at index ${siblingIndex} in level ${level}`);
        }
        siblingHash = sibling;
      } else {
        // Odd count - duplicate the current node
        if (!currentLevelNodes) {
          throw new Error(`Missing level ${level} nodes`);
        }
        const current = currentLevelNodes[currentIndex];
        if (!current) {
          throw new Error(`Missing current node at index ${currentIndex} in level ${level}`);
        }
        siblingHash = current;
      }

      proof.push(siblingHash);

      // Set position bit: 1 if current node is left child (even index)
      if (currentIndex % 2 === 0) {
        positions |= (1n << BigInt(level));
      }

      // Move to parent index
      currentIndex = Math.floor(currentIndex / 2);
    }

    // Extract leaf information for the proof
    // Note: This assumes the levels[0] corresponds to the ordered leaves
    const originalLeaf = this.findLeafByIndex(leafIndex);

    return {
      selector: originalLeaf.selector,
      facet: originalLeaf.facet,
      codehash: originalLeaf.codehash,
      proof,
      positions,
      leafIndex
    };
  }

  /**
   * Helper to find leaf by index
   */
  private findLeafByIndex(index: number): RouteLeaf {
    if (index < 0 || index >= this.currentLeaves.length) {
      throw new Error(`Invalid leaf index: ${index}, available: ${this.currentLeaves.length}`);
    }
    const leaf = this.currentLeaves[index];
    if (!leaf) {
      throw new Error(`Leaf at index ${index} is undefined`);
    }
    return leaf;
  }

  /**
   * Verify a proof against the root (off-chain verification)
   */
  verifyProof(proof: MerkleProof, root: string): boolean {
    try {
      // Recompute leaf hash
      const routeLeaf = this.computeRouteLeaf(proof.selector, proof.facet, proof.codehash);
      let currentHash = this.leafDomain(routeLeaf);

      // Walk up the tree using the proof
      for (let i = 0; i < proof.proof.length; i++) {
        const siblingHash = proof.proof[i];
        if (!siblingHash) {
          throw new Error(`Missing sibling hash at proof index ${i}`);
        }
        const isLeftChild = (proof.positions & (1n << BigInt(i))) !== 0n;

        if (isLeftChild) {
          // Current node is left child
          currentHash = this.nodeDomain(currentHash, siblingHash);
        } else {
          // Current node is right child
          currentHash = this.nodeDomain(siblingHash, currentHash);
        }
      }

      return currentHash === root;
    } catch (error) {
      console.error("Proof verification failed:", error);
      return false;
    }
  }

  /**
   * Build tree from facet codehashes and selector mappings
   */
  async buildFromArtifacts(
    facetCodehashes: Array<{ name: string; codehash: string; facetAddress?: string }>,
    selectorMappings: Array<{ selector: string; facet: string }>
  ): Promise<OrderedMerkleTree> {
    const leaves: RouteLeaf[] = [];
    const codehashMap = new Map(facetCodehashes.map(f => [f.name, f]));

    for (const mapping of selectorMappings) {
      const facetInfo = codehashMap.get(mapping.facet);
      if (!facetInfo) {
        throw new Error(`No codehash found for facet: ${mapping.facet}`);
      }

      // Use deployed address if available, otherwise use deterministic address
      const facetAddress = facetInfo.facetAddress || "0x0000000000000000000000000000000000000000";

      leaves.push({
        selector: mapping.selector,
        facet: facetAddress,
        codehash: facetInfo.codehash
      });
    }

    return this.buildTree(leaves);
  }

  /**
   * Export manifest root artifact
   */
  exportManifestRoot(
    tree: OrderedMerkleTree,
    chainId: number,
    epoch: number,
    buildConfig: any,
    outputPath: string
  ): ManifestRoot {
    const manifest: ManifestRoot = {
      chainId,
      epoch,
      root: tree.root,
      solc: buildConfig.solcVersion || "0.8.30",
      optimizer: buildConfig.optimizer || { enabled: true, runs: 200 },
      metadata: "none",
      leafOrder: tree.leafOrder,
      leaves: tree.leaves.length,
      buildHash: buildConfig.buildHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
    console.log(`💾 Exported manifest root: ${outputPath}`);

    return manifest;
  }

  /**
   * Export proofs package (compressed format for production)
   */
  exportProofs(tree: OrderedMerkleTree, outputPath: string): void {
    const proofsData: Record<string, any> = {};

    for (const [selector, proof] of tree.proofs) {
      proofsData[selector] = {
        facet: proof.facet,
        codehash: proof.codehash,
        proof: proof.proof,
        positions: "0x" + proof.positions.toString(16),
        leafIndex: proof.leafIndex
      };
    }

    const output = {
      timestamp: new Date().toISOString(),
      root: tree.root,
      totalProofs: tree.proofs.size,
      leafOrder: tree.leafOrder,
      proofs: proofsData
    };

    // TODO: Add compression with zstd
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`💾 Exported proofs package: ${outputPath}`);
  }

  /**
   * Verify tree reproducibility
   */
  verifyReproducibility(tree1: OrderedMerkleTree, tree2: OrderedMerkleTree): boolean {
    if (tree1.root !== tree2.root) {
      console.error("❌ Root mismatch in reproducibility check");
      return false;
    }

    if (tree1.leaves.length !== tree2.leaves.length) {
      console.error("❌ Leaf count mismatch in reproducibility check");
      return false;
    }

    // Verify leaf ordering is identical
    for (let i = 0; i < tree1.leaves.length; i++) {
      const leaf1 = tree1.leaves[i];
      const leaf2 = tree2.leaves[i];

      if (!leaf1 || !leaf2) {
        console.error(`❌ Missing leaf at index ${i} in reproducibility check`);
        return false;
      }

      if (leaf1.selector !== leaf2.selector ||
          leaf1.facet !== leaf2.facet ||
          leaf1.codehash !== leaf2.codehash) {
        console.error(`❌ Leaf mismatch at index ${i} in reproducibility check`);
        return false;
      }
    }

    console.log("✅ Tree reproducibility verified");
    return true;
  }
}
