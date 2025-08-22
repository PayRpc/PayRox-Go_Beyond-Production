#!/usr/bin/env node

/**
 * Build Merkle Tree with Real Codehashes
 * Now using the disciplined offline pipeline
 */

import { OfflinePipeline, PipelineConfig } from "../offline-pipeline";
import { ethers } from "ethers";
import fs from "fs";

async function main() {
  const mode = (process.argv[2] || "predictive") as "predictive" | "observed";

  if (!["predictive", "observed"].includes(mode)) {
    console.error("Usage: npx ts-node buildMerkle.ts [predictive|observed]");
    process.exit(1);
  }

  console.log(`🌳 Building Merkle Tree in ${mode.toUpperCase()} mode`);

  const config: PipelineConfig = {
    mode,
    outputDir: "./split-output",
    artifactsDir: "./artifacts",
    chainId: 1,
    epoch: 1,
    deterministic: {
      solcVersion: "0.8.30",
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: true,
      metadataBytecodeHash: "none"
    }
  };

  // Add provider for observed mode
  if (mode === "observed") {
    const rpcUrl = process.env.RPC_URL || "http://localhost:8545";
    config.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Parse deployed facets from environment or file
    const deployedFacetsJson = process.env.DEPLOYED_FACETS;
    if (deployedFacetsJson) {
      config.deployedFacets = JSON.parse(deployedFacetsJson);
    } else {
      // Try to load from file
      const deployedFacetsPath = "./split-output/deployed-facets.json";
      if (fs.existsSync(deployedFacetsPath)) {
        config.deployedFacets = JSON.parse(fs.readFileSync(deployedFacetsPath, "utf8"));
      } else {
        console.error("❌ Deployed facets not found. Set DEPLOYED_FACETS env var or create deployed-facets.json");
        process.exit(1);
      }
    }
  }

  // Add reference path for selector parity checking
  const referencePath = process.env.REFERENCE_PATH || "./artifacts/contracts/PayRoxMonolith.sol/PayRoxMonolith.json";
  if (fs.existsSync(referencePath)) {
    config.referencePath = referencePath;
  }

  try {
    const pipeline = new OfflinePipeline(config);
    const result = await pipeline.execute();

    if (result.success) {
      console.log(`
✅ MERKLE TREE BUILT SUCCESSFULLY
=================================

Root: ${result.tree.root}
Leaves: ${result.tree.leaves.length}
Proofs: ${result.tree.proofs.size}
Build Hash: ${result.buildHash}

Artifacts:
• Manifest: ${result.artifacts.manifestPath}
• Proofs: ${result.artifacts.proofsPath}
• Plan: ${result.artifacts.deploymentPlanPath}

Validation:
• Selector Parity: ${result.validation.selectorParity ? "✅" : "❌"}
• EIP-170 Compliance: ${result.validation.eip170Compliance ? "✅" : "❌"}
• Merkle Integrity: ${result.validation.merkleIntegrity ? "✅" : "❌"}
      `);

      // Export legacy format for backwards compatibility
      const legacyMerkle = {
        root: result.tree.root,
        leaves: result.tree.leaves.map(leaf => ({
          selector: leaf.selector,
          facet: leaf.facet,
          codehash: leaf.codehash,
          leafHash: leaf.leafHash
        })),
        proofs: Object.fromEntries(
          Array.from(result.tree.proofs.entries()).map(([selector, proof]) => [
            selector,
            proof.proof
          ])
        )
      };

      fs.writeFileSync(
        "./split-output/merkle.json",
        JSON.stringify(legacyMerkle, null, 2)
      );

      console.log("💾 Legacy merkle.json exported for compatibility");
      process.exit(0);
    } else {
      console.error("❌ Merkle tree build failed validation");
      process.exit(1);
    }
  } catch (error) {
    console.error("💥 Merkle tree build failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);
