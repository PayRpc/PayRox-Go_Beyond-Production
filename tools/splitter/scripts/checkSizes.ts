#!/usr/bin/env node

/**
 * EIP-170 Size Gate Validator
 * Checks deployed runtime bytecode size (not creation bytecode)
 */

import fs from "fs";
import path from "path";

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;

  (function rec(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (e.isFile() && p.endsWith(".json")) out.push(p);
    }
  })(dir);
  return out;
}

function checkEIP170Compliance(artifactsDir: string = "artifacts/contracts"): boolean {
  console.log("🔍 Checking EIP-170 compliance (runtime bytecode only)...");

  let allPassed = true;
  const facetFiles = walk(artifactsDir).filter(f =>
    f.includes("/facets/") ||
    f.includes("Facet.sol/") ||
    path.basename(f).includes("Facet")
  );

  if (facetFiles.length === 0) {
    console.warn("⚠️  No facet artifacts found in", artifactsDir);
    return true; // No facets to check
  }

  for (const artifactPath of facetFiles) {
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      const contractName = artifact.contractName || path.basename(artifactPath, ".json");

      // Get deployed runtime bytecode (not creation bytecode)
      const runtimeBytecode = artifact.deployedBytecode?.object ||
                             artifact.deployedRuntimeBytecode?.object ||
                             artifact.bytecode?.deployedBytecode ||
                             "";

      if (!runtimeBytecode) {
        console.warn(`⚠️  No runtime bytecode found for ${contractName}`);
        continue;
      }

      // Remove 0x prefix and calculate byte length
      const cleanBytecode = runtimeBytecode.replace(/^0x/, "");
      const runtimeBytes = cleanBytecode.length / 2;

      const EIP170_LIMIT = 24576; // 24KB

      if (runtimeBytes > EIP170_LIMIT) {
        console.error(`❌ ${contractName} exceeds EIP-170: ${runtimeBytes} bytes (runtime) > ${EIP170_LIMIT}`);
        allPassed = false;
      } else {
        console.log(`✅ ${contractName}: ${runtimeBytes} bytes (runtime) ✓`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${artifactPath}:`, error instanceof Error ? error.message : error);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log("🎉 All facets pass EIP-170 size limit");
  } else {
    console.error("💥 Some facets exceed EIP-170 size limit");
  }

  return allPassed;
}

// CLI usage
if (require.main === module) {
  const artifactsDir = process.argv[2] || "artifacts/contracts";
  const passed = checkEIP170Compliance(artifactsDir);
  process.exit(passed ? 0 : 1);
}

export { checkEIP170Compliance };
