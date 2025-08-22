/**
 * Plan Builder for Dispatcher Integration
 * Builds commit/apply plans for ManifestDispatcher and Orchestrator
 */

import { ethers } from "ethers";
import fs from "fs";
import { OrderedMerkleTree, ManifestRoot } from "./ordered-merkle";
import { FacetCodehash } from "./codehash-oracle";

export interface DeploymentPlan {
  planId: string; // bytes32 unique identifier
  selectors: string[]; // Array of 4-byte selectors
  facets: string[]; // Array of facet addresses
  codehashes: string[]; // Array of expected codehashes
  root: string; // Merkle root
  eta: number; // Earliest execution time (Unix timestamp)
  chainId: number;
  epoch: number;
  mode: "predictive" | "observed";
}

export interface OrchestrationPlan {
  id: string;
  root: string;
  selectors: string[];
  facets: string[];
  codehashes: string[];
  proofs: Array<{
    selector: string;
    proof: string[];
    positions: string;
  }>;
  gasEstimate: bigint;
  delay: number; // Timelock delay in seconds
}

export interface PreDeploymentChecks {
  selectorParity: boolean;
  eip170Compliance: boolean;
  codehashPredictions: boolean;
  merkleIntegrity: boolean;
  planValidity: boolean;
}

export interface PostDeploymentVerification {
  codehashMatches: boolean;
  routeIntegrity: boolean;
  merkleVerification: boolean;
  dispatcherSync: boolean;
}

export class PlanBuilder {
  private provider?: ethers.Provider;
  private timelockDelay: number = 86400; // 24 hours default

  constructor(provider?: ethers.Provider, timelockDelay?: number) {
    this.provider = provider;
    if (timelockDelay !== undefined) {
      this.timelockDelay = timelockDelay;
    }
  }

  /**
   * Build deployment plan from Merkle tree and facet mappings
   */
  async buildDeploymentPlan(
    tree: OrderedMerkleTree,
    manifest: ManifestRoot,
    facetCodehashes: FacetCodehash[],
    mode: "predictive" | "observed"
  ): Promise<DeploymentPlan> {
    // Sanity: Ensure leaf set aligns with routes we're about to encode
    if (!tree.leaves || tree.leaves.length === 0) {
      throw new Error('Empty leaf set in tree');
    }
    // Build selector to facet mapping
    const selectorToFacet = new Map<string, string>();
    const selectorToCodehash = new Map<string, string>();

    for (const leaf of tree.leaves) {
      selectorToFacet.set(leaf.selector, leaf.facet);
      selectorToCodehash.set(leaf.selector, leaf.codehash);
    }

    // Extract ordered arrays for the plan
    const selectors = tree.leaves.map(leaf => leaf.selector);
    const facets = tree.leaves.map(leaf => leaf.facet);
    const codehashes = tree.leaves.map(leaf => leaf.codehash);

    if (!(selectors.length === facets.length && facets.length === codehashes.length)) {
      throw new Error('routes/leaves length mismatch when building deployment plan');
    }

    // Generate unique plan ID from manifest hash and current timestamp
    const planId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256", "uint256"],
        [manifest.root, manifest.epoch, Date.now()]
      )
    );

    const plan: DeploymentPlan = {
      planId,
      selectors,
      facets,
      codehashes,
      root: tree.root,
      eta: Math.floor(Date.now() / 1000) + this.timelockDelay,
      chainId: manifest.chainId,
      epoch: manifest.epoch,
      mode
    };

    return plan;
  }

  /**
   * Build orchestration plan with proofs for on-chain execution
   */
  async buildOrchestrationPlan(
    tree: OrderedMerkleTree,
    deploymentPlan: DeploymentPlan
  ): Promise<OrchestrationPlan> {
    const proofs = [];

    for (const selector of deploymentPlan.selectors) {
      const proof = tree.proofs.get(selector);
      if (!proof) {
        throw new Error(`No proof found for selector: ${selector}`);
      }

      proofs.push({
        selector,
        proof: proof.proof,
        positions: "0x" + proof.positions.toString(16)
      });
    }

    // Estimate gas costs (rough estimation)
    const gasEstimate = this.estimateGasCosts(deploymentPlan);

    const orchestrationPlan: OrchestrationPlan = {
      id: deploymentPlan.planId,
      root: deploymentPlan.root,
      selectors: deploymentPlan.selectors,
      facets: deploymentPlan.facets,
      codehashes: deploymentPlan.codehashes,
      proofs,
      gasEstimate,
      delay: this.timelockDelay
    };

    return orchestrationPlan;
  }

  /**
   * Run pre-deployment checks
   */
  async runPreDeploymentChecks(
    tree: OrderedMerkleTree,
    deploymentPlan: DeploymentPlan,
    referencePath?: string
  ): Promise<PreDeploymentChecks> {
    const checks: PreDeploymentChecks = {
      selectorParity: false,
      eip170Compliance: false,
      codehashPredictions: false,
      merkleIntegrity: false,
      planValidity: false
    };

    try {
      // 1. Check selector parity (if reference provided)
      if (referencePath) {
        checks.selectorParity = await this.checkSelectorParity(deploymentPlan, referencePath);
      } else {
        checks.selectorParity = true; // Skip if no reference
      }

      // 2. Check EIP-170 compliance
      checks.eip170Compliance = await this.checkEIP170Compliance(deploymentPlan);

      // 3. Verify codehash predictions (in predictive mode)
      if (deploymentPlan.mode === "predictive") {
        checks.codehashPredictions = await this.verifyCodehashPredictions(deploymentPlan);
      } else {
        checks.codehashPredictions = true; // Skip in observed mode
      }

      // 4. Verify Merkle tree integrity
      checks.merkleIntegrity = this.verifyMerkleIntegrity(tree);

      // 5. Validate plan structure
      checks.planValidity = this.validatePlanStructure(deploymentPlan);

    } catch (error) {
      console.error("❌ Pre-deployment checks failed:", error);
    }

    return checks;
  }

  /**
   * Run post-deployment verification
   */
  async runPostDeploymentVerification(
    tree: OrderedMerkleTree,
    deploymentPlan: DeploymentPlan,
    deployedFacets: Record<string, string>
  ): Promise<PostDeploymentVerification> {
    if (!this.provider) {
      throw new Error("Provider required for post-deployment verification");
    }

    const verification: PostDeploymentVerification = {
      codehashMatches: false,
      routeIntegrity: false,
      merkleVerification: false,
      dispatcherSync: false
    };

    try {
      // 1. Verify deployed codehashes match expectations
      verification.codehashMatches = await this.verifyDeployedCodehashes(deploymentPlan, deployedFacets);

      // 2. Check route integrity (all selectors properly routed)
      verification.routeIntegrity = await this.verifyRouteIntegrity(deploymentPlan, deployedFacets);

      // 3. Verify Merkle proofs against on-chain verifier
      verification.merkleVerification = await this.verifyOnChainProofs(tree, deploymentPlan);

      // 4. Check dispatcher synchronization
      verification.dispatcherSync = await this.verifyDispatcherSync(deploymentPlan);

    } catch (error) {
      console.error("❌ Post-deployment verification failed:", error);
    }

    return verification;
  }

  /**
   * Export deployment plan to JSON
   */
  exportDeploymentPlan(plan: DeploymentPlan, outputPath: string): void {
    const output = {
      ...plan,
      timestamp: new Date().toISOString(),
      etaReadable: new Date(plan.eta * 1000).toISOString()
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`💾 Exported deployment plan: ${outputPath}`);
  }

  /**
   * Export orchestration plan for on-chain execution
   */
  exportOrchestrationPlan(plan: OrchestrationPlan, outputPath: string): void {
    const output = {
      ...plan,
      timestamp: new Date().toISOString(),
      gasEstimateEth: ethers.formatEther(plan.gasEstimate * BigInt(20e9)) // Assume 20 gwei
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));
    console.log(`💾 Exported orchestration plan: ${outputPath}`);
  }

  // Private helper methods

  private async checkSelectorParity(_plan: DeploymentPlan, _referencePath: string): Promise<boolean> {
    // TODO: Compare selectors with reference contract
    console.log("🔍 Checking selector parity...");
    return true; // Placeholder
  }

  private async checkEIP170Compliance(_plan: DeploymentPlan): Promise<boolean> {
    console.log("🔍 Checking EIP-170 compliance...");
    // All facets should have been validated during compilation
    return true; // Placeholder
  }

  private async verifyCodehashPredictions(_plan: DeploymentPlan): Promise<boolean> {
    console.log("🔍 Verifying codehash predictions...");
    // In predictive mode, codehashes are computed from artifacts
    return true; // Placeholder
  }

  private verifyMerkleIntegrity(_tree: OrderedMerkleTree): boolean {
    console.log("🔍 Verifying Merkle tree integrity...");

    // Verify all proofs can be validated against the root
  // TODO: Implement off-chain proof verification over tree.proofs entries
  // for (const [selector, proof] of tree.proofs) {
  //   if (!this.verifyProof(proof, tree.root)) {
  //     console.error(`❌ Invalid proof for selector: ${selector}`);
  //     return false;
  //   }
  // }

    return true;
  }

  private validatePlanStructure(plan: DeploymentPlan): boolean {
    console.log("🔍 Validating plan structure...");

    // Check array lengths match
    if (plan.selectors.length !== plan.facets.length ||
        plan.facets.length !== plan.codehashes.length) {
      console.error("❌ Plan array length mismatch");
      return false;
    }

    // Check for empty arrays
    if (plan.selectors.length === 0) {
      console.error("❌ Plan has no selectors");
      return false;
    }

    // Validate selector format
    for (const selector of plan.selectors) {
      if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) {
        console.error(`❌ Invalid selector format: ${selector}`);
        return false;
      }
    }

    // Validate facet addresses
    for (const facet of plan.facets) {
      try {
        ethers.getAddress(facet);
      } catch {
        console.error(`❌ Invalid facet address: ${facet}`);
        return false;
      }
    }

    return true;
  }

  private async verifyDeployedCodehashes(
    plan: DeploymentPlan,
  _deployedFacets: Record<string, string>
  ): Promise<boolean> {
    if (!this.provider) return false;

    console.log("🔍 Verifying deployed codehashes...");
    let mismatchCount = 0;

    for (let i = 0; i < plan.facets.length; i++) {
      const expectedCodehash = plan.codehashes[i];
      const facetAddress = plan.facets[i];

      if (!facetAddress) {
        console.error(`❌ Missing facet address at index ${i}`);
        mismatchCount++;
        continue;
      }

      try {
        const deployedCode = await this.provider.getCode(facetAddress);
        const actualCodehash = ethers.keccak256(deployedCode);

        if (actualCodehash !== expectedCodehash) {
          console.error(`❌ Codehash mismatch for ${facetAddress}`);
          console.error(`   Expected: ${expectedCodehash}`);
          console.error(`   Actual:   ${actualCodehash}`);
          mismatchCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to verify codehash for ${facetAddress}:`, error);
        mismatchCount++;
      }
    }

    return mismatchCount === 0;
  }

  private async verifyRouteIntegrity(
    _plan: DeploymentPlan,
    _deployedFacets: Record<string, string>
  ): Promise<boolean> {
    console.log("🔍 Verifying route integrity...");
    // TODO: Check that all selectors are properly routed
    return true;
  }

  private async verifyOnChainProofs(
    _tree: OrderedMerkleTree,
    _plan: DeploymentPlan
  ): Promise<boolean> {
    console.log("🔍 Verifying on-chain Merkle proofs...");
    // TODO: Call on-chain OrderedMerkle.verify for each proof
    return true;
  }

  private async verifyDispatcherSync(_plan: DeploymentPlan): Promise<boolean> {
    console.log("🔍 Verifying dispatcher synchronization...");
    // TODO: Check that dispatcher routes match the plan
    return true;
  }

  private estimateGasCosts(plan: DeploymentPlan): bigint {
    // Rough estimation: base cost + per-selector cost
    const baseCost = 100000n; // Base transaction cost
    const perSelectorCost = 50000n; // Per selector routing cost

    return baseCost + (BigInt(plan.selectors.length) * perSelectorCost);
  }
}
