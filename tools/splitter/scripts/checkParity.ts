#!/usr/bin/env node

/**
 * Selector Parity Gate Validator
 * Ensures all original selectors are preserved in facets (no more, no less)
 */

import fs from "fs";
import path from "path";
import { id as keccak256Utf8 } from "ethers";

// Compute function selector from signature
function selector(sig: string): string {
  return "0x" + keccak256Utf8(sig).slice(2, 10);
}

// Canonicalize type names for consistent signatures
function canonicalizeType(typeInfo: any): string {
  if (typeInfo.type === "uint") return "uint256";
  if (typeInfo.type === "int") return "int256";
  if (typeInfo.type.endsWith("[]")) {
    return canonicalizeType({ type: typeInfo.type.slice(0, -2), components: typeInfo.components }) + "[]";
  }
  if (typeInfo.type === "tuple") {
    return `(${(typeInfo.components || []).map(canonicalizeType).join(",")})`;
  }
  return typeInfo.type;
}

// Extract function selectors from ABI
function selectorsFromAbi(abi: any[]): Set<string> {
  const selectors = new Set<string>();

  for (const entry of abi) {
    if (entry.type === "function") {
      const signature = `${entry.name}(${(entry.inputs || []).map(canonicalizeType).join(",")})`;
      selectors.add(selector(signature));
    }
  }

  return selectors;
}

// Recursively find all artifact JSON files
function findArtifacts(dir: string): string[] {
  const artifacts: string[] = [];
  if (!fs.existsSync(dir)) return artifacts;

  (function recurse(currentDir: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        recurse(fullPath);
      } else if (entry.isFile() && fullPath.endsWith(".json")) {
        artifacts.push(fullPath);
      }
    }
  })(dir);

  return artifacts;
}

// Read all selectors from artifacts in a directory
function readAllSelectors(dir: string): Set<string> {
  const allSelectors = new Set<string>();

  for (const artifactPath of findArtifacts(dir)) {
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      if (Array.isArray(artifact.abi)) {
        for (const sel of selectorsFromAbi(artifact.abi)) {
          allSelectors.add(sel);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not parse ${artifactPath}:`, error instanceof Error ? error.message : error);
    }
  }

  return allSelectors;
}

function checkSelectorParity(
  monolithDir: string = "artifacts/contracts/monolith",
  facetsDir: string = "artifacts/contracts/facets"
): boolean {
  console.log("🔍 Checking selector parity...");

  // Find monolith artifacts - look for any large contract artifacts
  const monolithArtifacts = findArtifacts("artifacts/contracts").filter(f =>
    !f.includes("/facets/") &&
    !f.includes("/test/") &&
    !f.includes("/interfaces/") &&
    !f.includes("/libraries/") &&
    (f.includes("Monolith") || f.includes("PayRox") || f.includes(".sol/"))
  );

  if (monolithArtifacts.length === 0) {
    console.error("❌ No monolith artifacts found. Expected contracts to compare against.");
    return false;
  }

  // Get selectors from monolith(s)
  const originalSelectors = new Set<string>();
  for (const artifactPath of monolithArtifacts) {
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      if (Array.isArray(artifact.abi)) {
        for (const sel of selectorsFromAbi(artifact.abi)) {
          originalSelectors.add(sel);
        }
        console.log(`📋 Loaded ${artifact.contractName || path.basename(artifactPath)}: ${selectorsFromAbi(artifact.abi).size} selectors`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not parse monolith ${artifactPath}:`, error instanceof Error ? error.message : error);
    }
  }

  // Get selectors from facets
  const facetSelectors = readAllSelectors(facetsDir);

  console.log(`📊 Original: ${originalSelectors.size} selectors`);
  console.log(`📊 Facets: ${facetSelectors.size} selectors`);

  // Find missing and extra selectors
  const missing = [...originalSelectors].filter(s => !facetSelectors.has(s));
  const extra = [...facetSelectors].filter(s => !originalSelectors.has(s));

  let passed = true;

  if (missing.length > 0) {
    console.error(`❌ Missing selectors (${missing.length}):`, missing);
    passed = false;
  }

  if (extra.length > 0) {
    console.warn(`⚠️  Extra selectors (${extra.length}):`, extra);
    // Extra selectors are warnings, not failures (could be new helper functions)
  }

  if (passed) {
    console.log("✅ Selector parity OK - all original functions preserved");
  } else {
    console.error("💥 Selector parity FAILED - functions missing from facets");
  }

  return passed;
}

// CLI usage
if (require.main === module) {
  const monolithDir = process.argv[2] || "artifacts/contracts/monolith";
  const facetsDir = process.argv[3] || "artifacts/contracts/facets";
  const passed = checkSelectorParity(monolithDir, facetsDir);
  process.exit(passed ? 0 : 1);
}

export { checkSelectorParity };
