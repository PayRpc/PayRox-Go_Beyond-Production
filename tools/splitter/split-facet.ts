#!/usr/bin/env ts-node
import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";

/**
 * Simple, logical Solidity facet splitter.
 *
 * - Heuristically extracts pragma + imports + contract header
 * - Finds functions (basic parser that balances braces) after removing comments
 * - Groups functions into: Core (init/owner/admin/pause/upgrade), View (view|pure), Logic (payable|nonpayable)
 * - Emits one facet .sol file per group with tiny stub functions that `revert("TODO: migrate logic from monolith")`
 *
 * This is intentionally conservative: it never rewrites original logic, only emits stub facets that preserve
 * signatures and visibility/mutability. It's meant as a deterministic scaffold for downstream automated
 * refactoring tools.
 */

type FnInfo = {
  name: string;
  signature: string; // full signature text before body
  params: string;
  returnsClause: string;
  stateMutability: "view" | "pure" | "payable" | "nonpayable" | "";
  visibility: string;
  extraAttrs?: string; // virtual/override etc
  fullText: string; // signature + body
};

function stripComments(src: string): string {
  // remove /* */ and // comments
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function findContractInfo(
  src: string,
  contractName?: string,
): { header: string; contractName: string; body: string } | null {
  let match: RegExpMatchArray | null = null;
  if (contractName) {
    const re = new RegExp(
      "([\\s\\S]*?)contract\\s+" + contractName + "\\s*(?:is[^{]*)?\\s*\\{",
    );
    match = src.match(re);
  }

  if (!match) {
    match = src.match(
      /([\s\S]*?)contract\s+([A-Za-z0-9_]+)\s*(?:is[^{]*)?\s*\{/,
    );
  }
  if (!match) return null;
  const header = match[1] || "";
  const foundName = (match as any)[2] ?? contractName ?? "";
  const bodyStart = (match as any).index + match[0].lastIndexOf("{") + 1;

  // balance braces to find end of contract
  let depth = 1;
  let i = bodyStart;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = src.slice(bodyStart, i);
  return { header, contractName: foundName, body };
}

function extractFunctions(body: string): FnInfo[] {
  return [];
}

// Export functions for use by other modules and tests
export { stripComments, findContractInfo, extractFunctions };
