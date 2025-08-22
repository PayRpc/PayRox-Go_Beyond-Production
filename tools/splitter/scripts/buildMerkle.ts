#!/usr/bin/env node

/**
 * Build Merkle Tree with Real Codehashes
 * Supports both predictive (from artifacts) and observed (from deployed contracts) modes
 */

import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import crypto from "crypto";

interface MerkleLeaf {
  selector: string;
  facet: string;
  codehash: string;
  leafHash: string;
}

interface MerkleTree {
  root: string;
  leaves: MerkleLeaf[];
  proofs: { [selector: string]: string[] };
}

// Compute keccak256(abi.encode(selector, facet, codehash))
function computeLeafHash(selector: string, facet: string, codehash: string): string {
  // Simulate abi.encode(bytes4, string, bytes32)
  const encoded = ethers.solidityPacked(
    ["bytes4", "bytes32", "bytes32"],
    [selector, ethers.keccak256(ethers.toUtf8Bytes(facet)), codehash]
  );
  return ethers.keccak256(encoded);
}

// Build Merkle tree from leaves
function buildMerkleTree(leaves: MerkleLeaf[]): MerkleTree {
  if (leaves.length === 0) {
    throw new Error("Cannot build Merkle tree with no leaves");
  }

  // Sort leaves by selector for deterministic ordering
  const sortedLeaves = [...leaves].sort((a, b) => a.selector.localeCompare(b.selector));

  // Compute leaf hashes
  for (const leaf of sortedLeaves) {
    leaf.leafHash = computeLeafHash(leaf.selector, leaf.facet, leaf.codehash);
  }

  // Build tree bottom-up
  let currentLevel = sortedLeaves.map(l => l.leafHash);
  const allLevels: string[][] = [currentLevel];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // Duplicate if odd
      const parent = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [left, right]));
      nextLevel.push(parent);
    }
    allLevels.push(nextLevel);
    currentLevel = nextLevel;
  }

  const root = currentLevel[0];

  // Generate proofs for each leaf
  const proofs: { [selector: string]: string[] } = {};
  for (let leafIndex = 0; leafIndex < sortedLeaves.length; leafIndex++) {
    const leaf = sortedLeaves[leafIndex];
    const proof: string[] = [];
    let index = leafIndex;

    for (let level = 0; level < allLevels.length - 1; level++) {
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      if (siblingIndex < allLevels[level].length) {
        proof.push(allLevels[level][siblingIndex]);
      }

      index = Math.floor(index / 2);
    }

    proofs[leaf.selector] = proof;
  }

  return {
    root,
    leaves: sortedLeaves,
    proofs
  };
}

// Get codehash from compiled artifact (predictive mode)
function getCodehashFromArtifact(artifactPath: string): string {
  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const runtimeBytecode = artifact.deployedBytecode?.object ||
                           artifact.deployedRuntimeBytecode?.object ||
                           "";

    if (!runtimeBytecode) {
      throw new Error("No runtime bytecode found");
    }

    const cleanBytecode = runtimeBytecode.replace(/^0x/, "");
    return ethers.keccak256("0x" + cleanBytecode);
  } catch (error) {
    console.warn(`⚠️  Could not get codehash from ${artifactPath}:`, error instanceof Error ? error.message : error);
    return "0x" + "0".repeat(64); // Fallback to zero hash
  }
}

// Get codehash from deployed contract (observed mode)
async function getCodehashFromChain(contractAddress: string, provider: ethers.Provider): Promise<string> {
  try {
    const code = await provider.getCode(contractAddress);
    return ethers.keccak256(code);
  } catch (error) {
    console.warn(`⚠️  Could not get codehash from chain for ${contractAddress}:`, error instanceof Error ? error.message : error);
    return "0x" + "0".repeat(64); // Fallback to zero hash
  }
}

// Extract selector-to-facet mapping from manifest
function loadManifest(manifestPath: string = "./split-output/manifest.json"): { [selector: string]: string } {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const mapping: { [selector: string]: string } = {};

  for (const facet of manifest.facets || []) {
    for (const selector of facet.selectors || []) {
      mapping[selector] = facet.name;
    }
  }

  return mapping;
}

// Build tree in predictive mode (from artifacts)
async function buildPredictiveTree(
  artifactsDir: string = "artifacts/contracts/facets",
  manifestPath: string = "./split-output/manifest.json"
): Promise<MerkleTree> {
  console.log("🌳 Building Merkle tree (predictive mode)...");

  const selectorToFacet = loadManifest(manifestPath);
  const leaves: MerkleLeaf[] = [];

  // Find all facet artifacts
  const artifacts = fs.readdirSync(artifactsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(artifactsDir, d.name))
    .flatMap(dir => fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => path.join(dir, f)));

  for (const artifactPath of artifacts) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const facetName = artifact.contractName;

    if (!facetName || !facetName.includes("Facet")) continue;

    const codehash = getCodehashFromArtifact(artifactPath);

    // Add leaves for this facet's selectors
    for (const [selector, expectedFacet] of Object.entries(selectorToFacet)) {
      if (expectedFacet === facetName) {
        leaves.push({
          selector,
          facet: facetName,
          codehash,
          leafHash: "" // Will be computed in buildMerkleTree
        });
      }
    }
  }

  return buildMerkleTree(leaves);
}

// Build tree in observed mode (from deployed contracts)
async function buildObservedTree(
  deploymentPlan: string = "./split-output/dispatcher.plan.json",
  rpcUrl: string = "http://127.0.0.1:8545"
): Promise<MerkleTree> {
  console.log("🌳 Building Merkle tree (observed mode)...");

  if (!fs.existsSync(deploymentPlan)) {
    throw new Error(`Deployment plan not found at ${deploymentPlan}`);
  }

  const plan = JSON.parse(fs.readFileSync(deploymentPlan, "utf8"));
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const leaves: MerkleLeaf[] = [];

  // Get codehashes from deployed contracts
  for (let i = 0; i < plan.selectors.length; i++) {
    const selector = plan.selectors[i];
    const facet = plan.facets[i];
    const address = plan.deployedAddresses?.[facet];

    if (!address) {
      console.warn(`⚠️  No deployed address for ${facet}, using zero hash`);
      leaves.push({
        selector,
        facet,
        codehash: "0x" + "0".repeat(64),
        leafHash: ""
      });
      continue;
    }

    const codehash = await getCodehashFromChain(address, provider);
    leaves.push({
      selector,
      facet,
      codehash,
      leafHash: ""
    });
  }

  return buildMerkleTree(leaves);
}

// Save tree artifacts
function saveMerkleArtifacts(tree: MerkleTree, outputDir: string = "./split-output"): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save root
  fs.writeFileSync(
    path.join(outputDir, "root.json"),
    JSON.stringify({ root: tree.root, timestamp: new Date().toISOString() }, null, 2)
  );

  // Save full tree
  fs.writeFileSync(
    path.join(outputDir, "merkle.json"),
    JSON.stringify(tree, null, 2)
  );

  console.log(`✅ Merkle tree saved to ${outputDir}/`);
  console.log(`📋 Root: ${tree.root}`);
  console.log(`🍃 Leaves: ${tree.leaves.length}`);
}

// CLI usage
async function main() {
  const mode = process.argv[2] || "predictive"; // predictive | observed
  const outputDir = process.argv[3] || "./split-output";

  try {
    let tree: MerkleTree;

    if (mode === "observed") {
      const rpcUrl = process.argv[4] || "http://127.0.0.1:8545";
      tree = await buildObservedTree(path.join(outputDir, "dispatcher.plan.json"), rpcUrl);
    } else {
      tree = await buildPredictiveTree("artifacts/contracts/facets", path.join(outputDir, "manifest.json"));
    }

    saveMerkleArtifacts(tree, outputDir);
    console.log("🎉 Merkle tree generation complete");
  } catch (error) {
    console.error("💥 Merkle tree generation failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { buildPredictiveTree, buildObservedTree, buildMerkleTree, saveMerkleArtifacts };
