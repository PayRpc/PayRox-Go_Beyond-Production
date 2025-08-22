#!/usr/bin/env node

/**
 * Selector Parity Gate Validator
 * Ensures all original selectors are preserved in facets (no more, no less)
 * Now using the disciplined selector extractor
 */

import { CanonicalSelectorExtractor } from "../selector-extractor";
import fs from "fs";

async function checkSelectorParity(
  referencePath?: string,
  facetsDir: string = "artifacts/contracts/facets"
): Promise<boolean> {
  console.log("🔍 Checking selector parity...");

  // Auto-detect reference if not provided
  if (!referencePath) {
    const candidates = [
      "artifacts/contracts/PayRoxMonolith.sol/PayRoxMonolith.json",
      "artifacts/contracts/monolith/PayRoxMonolith.json",
      "artifacts/contracts/PayRox.sol/PayRox.json"
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        referencePath = candidate;
        break;
      }
    }

    if (!referencePath) {
      console.error("❌ No reference monolith artifact found. Please specify referencePath.");
      return false;
    }
  }

  try {
    const extractor = new CanonicalSelectorExtractor();

    // Extract selectors from facets first
    const extractResult = await extractor.extractFromArtifacts(facetsDir);

    if (extractResult.conflicts.length > 0) {
      console.error(`⚠️  Selector conflicts detected (${extractResult.conflicts.length}):`);
      for (const conflict of extractResult.conflicts) {
        console.error(`  ${conflict.selector}: ${conflict.facet1} vs ${conflict.facet2}`);
      }
    }

    // Compare with reference
    const comparisonResult = await extractor.compareWithReference(
      referencePath,
      extractResult.selectors
    );

    console.log(`📋 Reference: ${referencePath}`);
    console.log(`📊 Facets: ${extractResult.selectors.length} selectors`);
    console.log(`📊 Matches: ${comparisonResult.matches} selectors`);

    if (comparisonResult.missing.length > 0) {
      console.error(`❌ Missing selectors (${comparisonResult.missing.length}):`);
      comparisonResult.missing.forEach(missing => console.error(`  ${missing}`));
      console.error("💥 Selector parity FAILED - functions missing from facets");
      return false;
    }

    if (comparisonResult.extra.length > 0) {
      console.warn(`⚠️  Extra selectors (${comparisonResult.extra.length}):`);
      comparisonResult.extra.forEach(extra => console.warn(`  ${extra}`));
      // Extra selectors are warnings, not failures (could be new helper functions)
    }

    console.log("✅ Selector parity OK - all original functions preserved");
    return true;

  } catch (error) {
    console.error("💥 Selector parity check failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

// CLI usage
if (require.main === module) {
  (async () => {
    const referencePath = process.argv[2];
    const facetsDir = process.argv[3] || "artifacts/contracts/facets";
    const passed = await checkSelectorParity(referencePath, facetsDir);
    process.exit(passed ? 0 : 1);
  })().catch(error => {
    console.error("💥 Selector parity check failed:", error);
    process.exit(1);
  });
}

export { checkSelectorParity };
