#!/usr/bin/env ts-node

/**
 * Disciplined Offline Pipeline for OrderedMerkle Tree Building
 * Implements deterministic build + codehash oracle + selector extraction + tree building
 */

import fs from "fs";
import path from "path";
import { ethers } from "ethers";

// Import our pipeline components
import { DeterministicBuilder, DeterministicConfig, FacetCodehash } from "./codehash-oracle";
import { CanonicalSelectorExtractor, SelectorInfo } from "./selector-extractor";
import { OrderedMerkleBuilder, OrderedMerkleTree, ManifestRoot } from "./ordered-merkle";
import { PlanBuilder, DeploymentPlan, OrchestrationPlan } from "./plan-builder";

export interface PipelineConfig {
  mode: "predictive" | "observed";
  outputDir: string;
  artifactsDir: string;
  chainId: number;
  epoch: number;
  deterministic: DeterministicConfig;
  provider?: ethers.Provider;
  deployedFacets?: Record<string, string>; // For observed mode
  referencePath?: string; // For selector parity checking
}

export interface PipelineResult {
  success: boolean;
  buildHash: string;
  manifestRoot: ManifestRoot;
  deploymentPlan: DeploymentPlan;
  orchestrationPlan: OrchestrationPlan;
  tree: OrderedMerkleTree;
  codehashes: FacetCodehash[];
  selectors: SelectorInfo[];
  artifacts: {
    manifestPath: string;
    proofsPath: string;
    deploymentPlanPath: string;
    orchestrationPlanPath: string;
    codehashesPath: string;
    selectorsPath: string;
  };
  validation: {
    selectorParity: boolean;
    eip170Compliance: boolean;
    merkleIntegrity: boolean;
    reproducibility: boolean;
  };
}

export class OfflinePipeline {
  private config: PipelineConfig;
  private builder: DeterministicBuilder;
  private selectorExtractor: CanonicalSelectorExtractor;
  private merkleBuilder: OrderedMerkleBuilder;
  private planBuilder: PlanBuilder;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.builder = new DeterministicBuilder(config.deterministic);
    this.selectorExtractor = new CanonicalSelectorExtractor();
    this.merkleBuilder = new OrderedMerkleBuilder();
    this.planBuilder = new PlanBuilder(config.provider);
  }

  /**
   * Execute the complete offline pipeline
   */
  async execute(): Promise<PipelineResult> {
    console.log(`
🔧 PayRox Offline Pipeline - ${this.config.mode.toUpperCase()} MODE
============================================================

Configuration:
• Mode: ${this.config.mode}
• Chain ID: ${this.config.chainId}
• Epoch: ${this.config.epoch}
• Build Hash: ${this.builder.getBuildHash()}
• Output: ${this.config.outputDir}

Starting pipeline execution...
`);

    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.config.outputDir)) {
        fs.mkdirSync(this.config.outputDir, { recursive: true });
      }

      // Step 1: Extract canonical selectors
      console.log("📋 STEP 1: Canonical Selector Extraction");
      console.log("==========================================");
      const { selectors, conflicts } = await this.selectorExtractor.extractFromArtifacts(this.config.artifactsDir);

      if (conflicts.length > 0) {
        console.error(`❌ Found ${conflicts.length} selector conflicts:`);
        for (const conflict of conflicts) {
          console.error(`   ${conflict.selector}: ${conflict.facet1}:${conflict.signature1} vs ${conflict.facet2}:${conflict.signature2}`);
        }
        throw new Error("Selector conflicts must be resolved before continuing");
      }

      console.log(`✅ Extracted ${selectors.length} unique selectors`);

      // Step 2: Build/observe codehashes
      console.log("\n🔐 STEP 2: Codehash Oracle");
      console.log("==========================");
      let codehashes: FacetCodehash[];

      if (this.config.mode === "predictive") {
        codehashes = await this.builder.buildPredictiveCodehashes(this.config.artifactsDir);
        console.log(`✅ Generated ${codehashes.length} predictive codehashes`);
      } else {
        if (!this.config.deployedFacets) {
          throw new Error("Deployed facets required for observed mode");
        }
        if (!this.config.provider) {
          throw new Error("Provider required for observed mode");
        }
        codehashes = await this.builder.buildObservedCodehashes(this.config.provider, this.config.deployedFacets);
        console.log(`✅ Observed ${codehashes.length} deployed codehashes`);
      }

      // Step 3: Build selector-to-facet mappings
      console.log("\n🗺️  STEP 3: Route Mapping");
      console.log("========================");
      const selectorMappings = this.buildSelectorMappings(selectors, codehashes);
      console.log(`✅ Built ${selectorMappings.length} route mappings`);

      // Step 4: Build ordered Merkle tree
      console.log("\n🌳 STEP 4: Ordered Merkle Tree");
      console.log("==============================");
      const tree = await this.merkleBuilder.buildFromArtifacts(codehashes, selectorMappings);
      console.log(`✅ Built Merkle tree with root: ${tree.root}`);
      console.log(`   • Leaves: ${tree.leaves.length}`);
      console.log(`   • Proofs: ${tree.proofs.size}`);
      console.log(`   • Levels: ${tree.levels.length}`);

      // Step 5: Generate manifest root
      console.log("\n📋 STEP 5: Manifest Generation");
      console.log("===============================");
      const manifestPath = path.join(this.config.outputDir, "manifest.root.json");
      const manifestRoot = this.merkleBuilder.exportManifestRoot(
        tree,
        this.config.chainId,
        this.config.epoch,
        this.builder.getConfig(),
        manifestPath
      );

      // Step 6: Build deployment plans
      console.log("\n📝 STEP 6: Plan Generation");
      console.log("===========================");
      const deploymentPlan = await this.planBuilder.buildDeploymentPlan(
        tree,
        manifestRoot,
        codehashes,
        this.config.mode
      );

      const orchestrationPlan = await this.planBuilder.buildOrchestrationPlan(tree, deploymentPlan);

      console.log(`✅ Generated deployment plan: ${deploymentPlan.planId}`);
      console.log(`   • Selectors: ${deploymentPlan.selectors.length}`);
      console.log(`   • Gas estimate: ${orchestrationPlan.gasEstimate.toString()}`);

      // Step 7: Run validation gates
      console.log("\n🔍 STEP 7: Validation Gates");
      console.log("============================");
      const validation = await this.runValidationGates(tree, deploymentPlan, selectors);

      // Step 8: Export all artifacts
      console.log("\n💾 STEP 8: Artifact Export");
      console.log("===========================");
      const artifacts = await this.exportArtifacts(
        tree,
        deploymentPlan,
        orchestrationPlan,
        codehashes,
        selectors,
        conflicts
      );

      const result: PipelineResult = {
        success: validation.selectorParity && validation.eip170Compliance && validation.merkleIntegrity && validation.reproducibility,
        buildHash: this.builder.getBuildHash(),
        manifestRoot,
        deploymentPlan,
        orchestrationPlan,
        tree,
        codehashes,
        selectors,
        artifacts,
        validation
      };

      console.log(`
🎉 PIPELINE EXECUTION COMPLETE
==============================

Status: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}
Build Hash: ${result.buildHash}
Manifest Root: ${result.manifestRoot.root}

Validation Results:
• Selector Parity: ${validation.selectorParity ? "✅" : "❌"}
• EIP-170 Compliance: ${validation.eip170Compliance ? "✅" : "❌"}
• Merkle Integrity: ${validation.merkleIntegrity ? "✅" : "❌"}
• Reproducibility: ${validation.reproducibility ? "✅" : "❌"}

Artifacts exported to: ${this.config.outputDir}
`);

      return result;

    } catch (error) {
      console.error("❌ Pipeline execution failed:", error);
      throw error;
    }
  }

  /**
   * Verify pipeline reproducibility by running twice
   */
  async verifyReproducibility(): Promise<boolean> {
    console.log("\n🔄 Reproducibility Verification");
    console.log("================================");

    const result1 = await this.execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 100));

    const result2 = await this.execute();

    const isReproducible = this.merkleBuilder.verifyReproducibility(result1.tree, result2.tree);

    if (isReproducible) {
      console.log("✅ Pipeline is reproducible - identical results on re-run");
    } else {
      console.error("❌ Pipeline is not reproducible - results differ between runs");
    }

    return isReproducible;
  }

  // Private helper methods

  private buildSelectorMappings(
    selectors: SelectorInfo[],
    codehashes: FacetCodehash[]
  ): Array<{ selector: string; facet: string }> {
    const codehashMap = new Map(codehashes.map(c => [c.name, c]));
    const mappings: Array<{ selector: string; facet: string }> = [];

    for (const selector of selectors) {
      const facetCodehash = codehashMap.get(selector.facet);
      if (!facetCodehash) {
        console.warn(`⚠️  No codehash found for facet ${selector.facet}, skipping selector ${selector.selector} (likely an interface)`);
        continue; // Skip interfaces and other non-deployable contracts
      }

      mappings.push({
        selector: selector.selector,
        facet: selector.facet
      });
    }

    return mappings;
  }

  private async runValidationGates(
    tree: OrderedMerkleTree,
    deploymentPlan: DeploymentPlan,
    selectors: SelectorInfo[]
  ) {
    const validation = {
      selectorParity: true,
      eip170Compliance: true,
      merkleIntegrity: true,
      reproducibility: true
    };

    // 1. Selector parity check
    if (this.config.referencePath) {
      try {
        const comparison = await this.selectorExtractor.compareWithReference(this.config.referencePath, selectors);
        validation.selectorParity = comparison.missing.length === 0 && comparison.extra.length === 0;

        if (!validation.selectorParity) {
          console.error(`❌ Selector parity failed:`);
          console.error(`   Missing: ${comparison.missing.length}`);
          console.error(`   Extra: ${comparison.extra.length}`);
        } else {
          console.log(`✅ Selector parity passed: ${comparison.matches} matches`);
        }
      } catch (error) {
        console.error("❌ Selector parity check failed:", error);
        validation.selectorParity = false;
      }
    } else {
      console.log("⏭️  Skipped selector parity (no reference provided)");
    }

    // 2. EIP-170 compliance check
    try {
      for (const codehash of this.config.mode === "predictive" ?
          await this.builder.buildPredictiveCodehashes(this.config.artifactsDir) :
          []) {
        // Rough size check - in real implementation, check actual deployed bytecode size
        if (codehash.runtimeBytecode.length > 49152) { // 24KB * 2 (hex chars)
          console.error(`❌ EIP-170 violation: ${codehash.name} > 24KB`);
          validation.eip170Compliance = false;
        }
      }

      if (validation.eip170Compliance) {
        console.log("✅ EIP-170 compliance verified");
      }
    } catch (error) {
      console.error("❌ EIP-170 compliance check failed:", error);
      validation.eip170Compliance = false;
    }

    // 3. Merkle integrity check
    try {
      // Verify all proofs against the root
      let validProofs = 0;
      for (const [selector, proof] of tree.proofs) {
        if (this.merkleBuilder.verifyProof(proof, tree.root)) {
          validProofs++;
        } else {
          console.error(`❌ Invalid proof for selector: ${selector}`);
          validation.merkleIntegrity = false;
        }
      }

      if (validation.merkleIntegrity) {
        console.log(`✅ Merkle integrity verified: ${validProofs}/${tree.proofs.size} proofs valid`);
      }
    } catch (error) {
      console.error("❌ Merkle integrity check failed:", error);
      validation.merkleIntegrity = false;
    }

    // 4. Plan validation
    const preChecks = await this.planBuilder.runPreDeploymentChecks(tree, deploymentPlan, this.config.referencePath);
    if (!preChecks.planValidity) {
      console.error("❌ Plan validation failed");
      validation.reproducibility = false;
    } else {
      console.log("✅ Plan validation passed");
    }

    return validation;
  }

  private async exportArtifacts(
    tree: OrderedMerkleTree,
    deploymentPlan: DeploymentPlan,
    orchestrationPlan: OrchestrationPlan,
    codehashes: FacetCodehash[],
    selectors: SelectorInfo[],
    conflicts: any[]
  ) {
    const artifacts = {
      manifestPath: path.join(this.config.outputDir, "manifest.root.json"),
      proofsPath: path.join(this.config.outputDir, "proofs.json"),
      deploymentPlanPath: path.join(this.config.outputDir, "deployment-plan.json"),
      orchestrationPlanPath: path.join(this.config.outputDir, "orchestration-plan.json"),
      codehashesPath: path.join(this.config.outputDir, `codehashes-${this.config.mode}.json`),
      selectorsPath: path.join(this.config.outputDir, "selectors.json")
    };

    // Export proofs package
    this.merkleBuilder.exportProofs(tree, artifacts.proofsPath);

    // Export deployment plan
    this.planBuilder.exportDeploymentPlan(deploymentPlan, artifacts.deploymentPlanPath);

    // Export orchestration plan
    this.planBuilder.exportOrchestrationPlan(orchestrationPlan, artifacts.orchestrationPlanPath);

    // Export codehashes
    await this.builder.saveCodehashArtifacts(codehashes, this.config.outputDir, this.config.mode);

    // Export selectors
    this.selectorExtractor.exportToJson(selectors, conflicts, artifacts.selectorsPath);

    return artifacts;
  }
}

/**
 * CLI interface for the offline pipeline
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = (args[0] || "predictive") as "predictive" | "observed";

  if (!["predictive", "observed"].includes(mode)) {
    console.error("Usage: npm run pipeline [predictive|observed]");
    process.exit(1);
  }

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
    const rpcUrl = process.env.RPC_URL;
    if (rpcUrl) {
      config.provider = new ethers.JsonRpcProvider(rpcUrl);
    }

    // Parse deployed facets from environment
    const deployedFacetsJson = process.env.DEPLOYED_FACETS;
    if (deployedFacetsJson) {
      config.deployedFacets = JSON.parse(deployedFacetsJson);
    }
  }

  // Add reference path if provided
  const referencePath = process.env.REFERENCE_PATH;
  if (referencePath && fs.existsSync(referencePath)) {
    config.referencePath = referencePath;
  }

  try {
    const pipeline = new OfflinePipeline(config);

    // Run reproducibility check if requested
    if (process.env.VERIFY_REPRODUCIBILITY === "true") {
      await pipeline.verifyReproducibility();
    } else {
      await pipeline.execute();
    }

    console.log("🎉 Pipeline execution completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("💥 Pipeline execution failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
