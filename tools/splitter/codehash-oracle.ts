/**
 * Deterministic Build System with Codehash Oracle
 * Supports both predictive (pre-deploy) and observed (post-deploy) modes
 */

import { ethers } from "ethers";
import fs from "fs";
import path from "path";

export interface DeterministicConfig {
  solcVersion: string;
  optimizer: { enabled: boolean; runs: number };
  evmVersion: string;
  viaIR: boolean;
  metadataBytecodeHash: "none"; // Force reproducible builds
  libraries?: Record<string, string>; // Fixed library addresses
}

export interface CodehashOracle {
  mode: "predictive" | "observed";
  config: DeterministicConfig;
  dockerImage?: string; // For reproducible builds
}

export interface FacetCodehash {
  name: string;
  facetAddress?: string; // Only in observed mode
  runtimeBytecode: string;
  codehash: string;
  buildHash: string; // Hash of build inputs for reproducibility
}

export class DeterministicBuilder {
  private config: DeterministicConfig;
  private buildHash: string;

  constructor(config: DeterministicConfig) {
    this.config = config;
    this.buildHash = this.computeBuildHash();
  }

  /**
   * Compute deterministic build hash from all build inputs
   */
  private computeBuildHash(): string {
    const inputs = {
      solcVersion: this.config.solcVersion,
      optimizer: this.config.optimizer,
      evmVersion: this.config.evmVersion,
      viaIR: this.config.viaIR,
      metadataBytecodeHash: this.config.metadataBytecodeHash,
      libraries: this.config.libraries || {}
    };

    const serialized = JSON.stringify(inputs, Object.keys(inputs).sort());
    return ethers.keccak256(ethers.toUtf8Bytes(serialized));
  }

  /**
   * Get expected codehash from runtime bytecode (predictive mode)
   */
  predictCodehash(runtimeBytecode: string): string {
    if (!runtimeBytecode.startsWith("0x")) {
      runtimeBytecode = "0x" + runtimeBytecode;
    }
    return ethers.keccak256(runtimeBytecode);
  }

  /**
   * Get actual codehash from deployed contract (observed mode)
   */
  async observeCodehash(provider: ethers.Provider, contractAddress: string): Promise<string> {
    const code = await provider.getCode(contractAddress);
    if (code === "0x") {
      throw new Error(`No code found at address ${contractAddress}`);
    }
    return ethers.keccak256(code);
  }

  /**
   * Build facet codehashes in predictive mode
   */
  async buildPredictiveCodehashes(artifactsDir: string): Promise<FacetCodehash[]> {
    const results: FacetCodehash[] = [];
    const artifactFiles = this.findFacetArtifacts(artifactsDir);

    for (const artifactPath of artifactFiles) {
      try {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        const facetName = path.basename(artifactPath, ".json");

        if (!artifact.deployedBytecode || artifact.deployedBytecode === "0x") {
          console.warn(`⚠️  No deployed bytecode for ${facetName}, skipping...`);
          continue;
        }

        const runtimeBytecode = artifact.deployedBytecode;
        const codehash = this.predictCodehash(runtimeBytecode);

        results.push({
          name: facetName,
          runtimeBytecode,
          codehash,
          buildHash: this.buildHash
        });

        console.log(`✅ Predicted codehash for ${facetName}: ${codehash}`);
      } catch (error) {
        console.error(`❌ Failed to process ${artifactPath}:`, error);
      }
    }

    return results;
  }

  /**
   * Build facet codehashes in observed mode (after deployment)
   */
  async buildObservedCodehashes(
    provider: ethers.Provider,
    deployedFacets: Record<string, string>
  ): Promise<FacetCodehash[]> {
    const results: FacetCodehash[] = [];

    for (const [facetName, facetAddress] of Object.entries(deployedFacets)) {
      try {
        const runtimeBytecode = await provider.getCode(facetAddress);
        const codehash = await this.observeCodehash(provider, facetAddress);

        results.push({
          name: facetName,
          facetAddress,
          runtimeBytecode,
          codehash,
          buildHash: this.buildHash
        });

        console.log(`✅ Observed codehash for ${facetName}: ${codehash}`);
      } catch (error) {
        console.error(`❌ Failed to observe ${facetName} at ${facetAddress}:`, error);
      }
    }

    return results;
  }

  /**
   * Verify predicted vs observed codehashes
   */
  verifyCodehashParity(
    predicted: FacetCodehash[],
    observed: FacetCodehash[]
  ): { success: boolean; mismatches: string[] } {
    const mismatches: string[] = [];
    const predictedMap = new Map(predicted.map(f => [f.name, f.codehash]));

    for (const obs of observed) {
      const pred = predictedMap.get(obs.name);
      if (!pred) {
        mismatches.push(`${obs.name}: missing in predicted set`);
      } else if (pred !== obs.codehash) {
        mismatches.push(`${obs.name}: predicted ${pred} != observed ${obs.codehash}`);
      }
    }

    return {
      success: mismatches.length === 0,
      mismatches
    };
  }

  /**
   * Find all facet artifact files
   */
  private findFacetArtifacts(artifactsDir: string): string[] {
    // Prefer generated stubs under contracts/facets-fixed, then fall back to contracts/facets
    const byName = new Map<string, string>();
    const bases = [
      path.join(artifactsDir, "contracts", "facets-fixed"),
      path.join(artifactsDir, "contracts", "facets")
    ];

    const scan = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
          const contractName = entry.name.replace(".json", "");
          if (!contractName.endsWith("Facet")) continue;
          if (!byName.has(contractName)) {
            byName.set(contractName, fullPath);
          }
        }
      }
    };

    for (const b of bases) scan(b);

    const results = Array.from(byName.values());
    if (results.length === 0) {
      throw new Error(
        `No facet artifacts found under ${bases.join(", ")}. Did you compile?`
      );
    }
    return results;
  }

  /**
   * Save codehash artifacts for reproducibility
   */
  async saveCodehashArtifacts(
    codehashes: FacetCodehash[],
    outputDir: string,
    mode: "predictive" | "observed"
  ): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const artifact = {
      timestamp: new Date().toISOString(),
      mode,
      buildHash: this.buildHash,
      config: this.config,
      codehashes: codehashes.map(c => ({
        name: c.name,
        facetAddress: c.facetAddress,
        codehash: c.codehash,
        buildHash: c.buildHash
      }))
    };

    const filename = `codehashes-${mode}-${Date.now()}.json`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(artifact, null, 2));
    console.log(`💾 Saved codehash artifacts: ${filepath}`);
  }

  getBuildHash(): string {
    return this.buildHash;
  }

  getConfig(): DeterministicConfig {
    return { ...this.config };
  }
}

/**
 * Docker-based reproducible build (optional enhancement)
 */
export class DockerBuilder extends DeterministicBuilder {
  private dockerImage: string;

  constructor(config: DeterministicConfig, dockerImage: string = "ethereum/solc:0.8.30") {
    super(config);
    this.dockerImage = dockerImage;
  }

  /**
   * Build contracts in Docker for maximum reproducibility
   */
  async buildInDocker(sourceDir: string, outputDir: string): Promise<void> {
    // This would execute Docker commands to compile contracts
    // For now, just log the intended command
    console.log(`🐳 Docker build command (not executed):`);
    console.log(`docker run --rm -v ${sourceDir}:/src -v ${outputDir}:/out ${this.dockerImage} ...`);

    // In a real implementation, this would:
    // 1. Mount source directory into container
    // 2. Execute solc with exact config
    // 3. Extract artifacts to output directory
    // 4. Verify build hash consistency
  }
}
