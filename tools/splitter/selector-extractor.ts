/**
 * Canonical Selector Extractor
 * Extracts 4-byte selectors from compiled ABIs with proper normalization
 */

import { ethers } from "ethers";
import fs from "fs";
import path from "path";

export interface SelectorInfo {
  signature: string; // Canonical signature like "transfer(address,uint256)"
  selector: string; // 4-byte hex like "0xa9059cbb"
  facet: string; // Facet name
  contractName: string; // Full contract name
  stateMutability: string;
  type: "function" | "error" | "event";
}

export interface SelectorConflict {
  selector: string;
  signature1: string;
  signature2: string;
  facet1: string;
  facet2: string;
}

export class CanonicalSelectorExtractor {
  private selectors: Map<string, SelectorInfo> = new Map();
  private conflicts: SelectorConflict[] = [];

  /**
   * Extract selectors from all facet artifacts
   */
  async extractFromArtifacts(artifactsDir: string): Promise<{
    selectors: SelectorInfo[];
    conflicts: SelectorConflict[];
  }> {
    this.selectors.clear();
    this.conflicts = [];

    const artifactFiles = this.findFacetArtifacts(artifactsDir);

    for (const artifactPath of artifactFiles) {
      await this.processArtifact(artifactPath);
    }

    return {
      selectors: Array.from(this.selectors.values()),
      conflicts: this.conflicts
    };
  }

  /**
   * Process a single artifact file
   */
  private async processArtifact(artifactPath: string): Promise<void> {
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      const facetName = this.extractFacetName(artifactPath);
      const contractName = artifact.contractName || facetName;

      if (!artifact.abi || !Array.isArray(artifact.abi)) {
        console.warn(`⚠️  No ABI found in ${artifactPath}`);
        return;
      }

      // Process functions
      for (const abiEntry of artifact.abi) {
        if (abiEntry.type === "function") {
          this.processFunctionEntry(abiEntry, facetName, contractName);
        }
      }

      console.log(`✅ Processed ${facetName}: ${artifact.abi.filter((e: any) => e.type === "function").length} functions`);
    } catch (error) {
      console.error(`❌ Failed to process ${artifactPath}:`, error);
    }
  }

  /**
   * Process a single function ABI entry
   */
  private processFunctionEntry(abiEntry: any, facetName: string, contractName: string): void {
    try {
      const canonicalSig = this.buildCanonicalSignature(abiEntry);
      const selector = this.computeSelector(canonicalSig);

      const selectorInfo: SelectorInfo = {
        signature: canonicalSig,
        selector,
        facet: facetName,
        contractName,
        stateMutability: abiEntry.stateMutability || "nonpayable",
        type: "function"
      };

      // Check for conflicts
      const existing = this.selectors.get(selector);
      if (existing) {
        // Only report conflict if signatures are different (actual collision)
        if (existing.signature !== canonicalSig) {
          this.conflicts.push({
            selector,
            signature1: existing.signature,
            signature2: canonicalSig,
            facet1: existing.facet,
            facet2: facetName
          });
          console.warn(`⚠️  Selector collision: ${selector}`);
          console.warn(`   ${existing.facet}: ${existing.signature}`);
          console.warn(`   ${facetName}: ${canonicalSig}`);
        }
      } else {
        this.selectors.set(selector, selectorInfo);
      }
    } catch (error) {
      console.error(`❌ Failed to process function ${abiEntry.name}:`, error);
    }
  }

  /**
   * Build canonical function signature from ABI entry
   */
  private buildCanonicalSignature(abiEntry: any): string {
    if (abiEntry.type !== "function") {
      throw new Error(`Expected function, got ${abiEntry.type}`);
    }

    const name = abiEntry.name;
    const inputs = abiEntry.inputs || [];

    const paramTypes = inputs.map((input: any) => this.canonicalizeType(input));
    const signature = `${name}(${paramTypes.join(",")})`;

    return signature;
  }

  /**
   * Canonicalize a type according to ABI specification
   */
  private canonicalizeType(input: any): string {
    let type = input.type;

    // Normalize basic types
    if (type === "uint") return "uint256";
    if (type === "int") return "int256";
    if (type === "byte") return "bytes1";

    // Handle arrays
    if (type.endsWith("[]")) {
      const baseType = this.canonicalizeType({
        type: type.slice(0, -2),
        components: input.components
      });
      return `${baseType}[]`;
    }

    // Handle fixed arrays like uint256[10]
    const fixedArrayMatch = type.match(/^(.+)\[(\d+)\]$/);
    if (fixedArrayMatch) {
      const baseType = this.canonicalizeType({
        type: fixedArrayMatch[1],
        components: input.components
      });
      return `${baseType}[${fixedArrayMatch[2]}]`;
    }

    // Handle tuples
    if (type === "tuple") {
      if (!input.components || !Array.isArray(input.components)) {
        throw new Error(`Tuple type missing components: ${JSON.stringify(input)}`);
      }
      const componentTypes = input.components.map((comp: any) => this.canonicalizeType(comp));
      return `(${componentTypes.join(",")})`;
    }

    // Return as-is for other types (address, bool, bytes, etc.)
    return type;
  }

  /**
   * Compute 4-byte selector from canonical signature
   */
  private computeSelector(signature: string): string {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(signature));
    return hash.slice(0, 10); // "0x" + first 4 bytes (8 hex chars)
  }

  /**
   * Extract facet name from artifact path
   */
  private extractFacetName(artifactPath: string): string {
    const filename = path.basename(artifactPath, ".json");

    // Remove directory structure from contract name if present
    const parts = filename.split(":");
    return parts[parts.length - 1] || filename;
  }

  /**
   * Find all facet artifact files
   */
  private findFacetArtifacts(artifactsDir: string): string[] {
    const byName = new Map<string, string>();

    const scan = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
          const contractName = entry.name.replace(".json", "");
          if (!(contractName.endsWith("Facet") || contractName.includes("Facet"))) continue;
          if (!byName.has(contractName)) {
            byName.set(contractName, fullPath);
          }
        }
      }
    };

    const fixedBase = path.join(artifactsDir, "contracts", "facets-fixed");
    scan(fixedBase);

    if (byName.size === 0) {
      const fallbackBase = path.join(artifactsDir, "contracts", "facets");
      scan(fallbackBase);
    }

    const results = Array.from(byName.values());
    if (results.length === 0) {
  throw new Error(`Facets directory not found under: ${fixedBase} or its fallback`);
    }
    return results;
  }

  /**
   * Compare selectors against a reference (monolith) contract
   */
  async compareWithReference(
    referencePath: string,
    facetSelectors: SelectorInfo[]
  ): Promise<{
    missing: string[]; // In reference but not in facets
    extra: string[]; // In facets but not in reference
    matches: number;
  }> {
    const referenceSelectors = await this.extractFromReference(referencePath);
    const facetSelectorSet = new Set(facetSelectors.map(s => s.selector));
    const referenceSelectorSet = new Set(referenceSelectors.map(s => s.selector));

    const missing = referenceSelectors
      .filter(s => !facetSelectorSet.has(s.selector))
      .map(s => `${s.selector} (${s.signature})`);

    const extra = facetSelectors
      .filter(s => !referenceSelectorSet.has(s.selector))
      .map(s => `${s.selector} (${s.signature})`);

    const matches = facetSelectors.filter(s => referenceSelectorSet.has(s.selector)).length;

    return { missing, extra, matches };
  }

  /**
   * Extract selectors from reference contract
   */
  private async extractFromReference(referencePath: string): Promise<SelectorInfo[]> {
    if (!fs.existsSync(referencePath)) {
      throw new Error(`Reference artifact not found: ${referencePath}`);
    }

    const artifact = JSON.parse(fs.readFileSync(referencePath, "utf8"));
    const selectors: SelectorInfo[] = [];

    if (!artifact.abi || !Array.isArray(artifact.abi)) {
      throw new Error(`No ABI found in reference artifact: ${referencePath}`);
    }

    for (const abiEntry of artifact.abi) {
      if (abiEntry.type === "function") {
        const canonicalSig = this.buildCanonicalSignature(abiEntry);
        const selector = this.computeSelector(canonicalSig);

        selectors.push({
          signature: canonicalSig,
          selector,
          facet: "reference",
          contractName: artifact.contractName || "Reference",
          stateMutability: abiEntry.stateMutability || "nonpayable",
          type: "function"
        });
      }
    }

    return selectors;
  }

  /**
   * Export selectors to JSON for CI/CD integration
   */
  exportToJson(
    selectors: SelectorInfo[],
    conflicts: SelectorConflict[],
    outputPath: string
  ): void {
    const output = {
      timestamp: new Date().toISOString(),
      totalSelectors: selectors.length,
      totalConflicts: conflicts.length,
      selectors: selectors.sort((a, b) => a.selector.localeCompare(b.selector)),
      conflicts
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`💾 Exported selectors to: ${outputPath}`);
  }
}
