import fs from 'fs';
import path from 'path';
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

function findBalancedBlock(s: string, start: number): number {
  let _i = start;
  let _depth = 0;
  let _inSingle = false;
  let _inDouble = false;
  let _inBacktick = false;
  let _esc = false;
  for (; i < s.length; i++) {
    const _c = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (!inDouble && c === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && c === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && c === "`") {
      inBacktick = !inBacktick;
      continue;
    }
    if (inSingle || inDouble || inBacktick) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stripComments(src: string): string {
  // remove /* */ and // comments
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function findContractInfo(
  src: string,
  contractName?: string,
): { header: string; contractName: string; body: string } | null {
  // If a contractName is provided, search for that specific contract
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
  const _header = match[1] || "";
  const _foundName = (match as any)[2] ?? contractName ?? "";
  const _bodyStart = (match as any).index + match[0].lastIndexOf("{") + 1;

  // balance braces to find end of contract
  let _depth = 1;
  let _i = bodyStart;
  for (; i < src.length; i++) {
    const _ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const _body = src.slice(bodyStart, i);
  return { header, contractName: foundName, body };
}

function extractFunctions(body: string): FnInfo[] {
  const fns: FnInfo[] = [];
  let _pos = 0;
  const _keywords = ["function", "constructor", "fallback", "receive"];
  while (pos < body.length) {
    // find next keyword occurrence
    let _idx = -1;
    let _foundKw = "";
    for (const kw of keywords) {
      const _kpos = body.indexOf(kw, pos);
      if (kpos !== -1 && (idx === -1 || kpos < idx)) {
        idx = kpos;
        foundKw = kw;
      }
    }
    if (idx === -1) break;

    // ensure token boundary
    if (/\w/.test(body[idx - 1] || "")) {
      pos = idx + foundKw.length;
      continue;
    }

    const _sigStart = idx;

    // if semicolon appears before any body start and keyword is function, treat as interface/abstract
    if (foundKw === "function") {
      const _braceIdx = body.indexOf("{", sigStart);
      const _semicolonIdx = body.indexOf(";", sigStart);
      if (semicolonIdx !== -1 && (braceIdx === -1 || semicolonIdx < braceIdx)) {
        const _fullSig = body.slice(sigStart, semicolonIdx + 1).trim();
        const m = fullSig.match(
          /function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*([^;]*)/s,
        );
        if (m) {
          const _name = m[1] ?? "";
          const _params = m[2] ?? "";
          const _rest = m[3] ?? "";
          const visibilityMatch = rest.match(
            /(public|external|internal|private)/,
          );
          const visibility =
            (visibilityMatch && visibilityMatch[1]) || "external";
          const _mutMatch = rest.match(/(view|pure|payable)/);
          const stateMutability = mutMatch
            ? (mutMatch[1] as any)
            : "nonpayable";
          const extraAttrMatch = rest.match(
            /\b(virtual|override(?:\s*\(.*?\))?)\b/g,
          );
          const extraAttrs = extraAttrMatch
            ? " " + extraAttrMatch.join(" ")
            : "";
          fns.push({
            name,
            signature: (fullSig + extraAttrs).trim(),
            params,
            returnsClause: "",
            stateMutability: stateMutability as any,
            visibility,
            extraAttrs: extraAttrs.trim(),
            fullText: fullSig,
          });
        }
        pos = semicolonIdx + 1;
        continue;
      }
    }

    // find body using string-aware balancer
    const _braceIdx = body.indexOf("{", sigStart);
    if (braceIdx === -1) {
      pos = sigStart + foundKw.length;
      continue;
    }
    const _j = findBalancedBlock(body, braceIdx);
    if (j === -1) break;

    const _fullText = body.slice(sigStart, j + 1).trim();

    if (foundKw === "constructor") {
      // constructor(...) { ... }
      const _sigMatch = fullText.match(/constructor\s*\(([^)]*)\)\s*([^{]*)\{/s);
      const _params = sigMatch ? (sigMatch[1] ?? "") : "";
      const _rest = sigMatch ? (sigMatch[2] ?? "") : "";
      const _visibilityMatch = rest.match(/(public|external|internal|private)/);
      const _visibility = (visibilityMatch && visibilityMatch[1]) || "public";
      fns.push({
        name: "constructor",
        signature: fullText.slice(0, fullText.indexOf("{")).trim(),
        params,
        returnsClause: "",
        stateMutability: "nonpayable",
        visibility,
        fullText,
      });
      pos = j + 1;
      continue;
    }

    if (foundKw === "fallback" || foundKw === "receive") {
      // fallback() external [payable] { ... } or receive() external payable { ... }
      const _name = foundKw;
      const sigMatch = fullText.match(
        /(?:fallback|receive)\s*\(\s*\)\s*([^{]*)\{/,
      );
      const _rest = sigMatch ? (sigMatch[1] ?? "") : "";
      const _visibilityMatch = rest.match(/(public|external|internal|private)/);
      const _visibility = (visibilityMatch && visibilityMatch[1]) || "external";
      const _mutMatch = rest.match(/(payable)/);
      const _stateMutability = mutMatch ? (mutMatch[1] as any) : "nonpayable";
      fns.push({
        name,
        signature: fullText.slice(0, fullText.indexOf("{")).trim(),
        params: "",
        returnsClause: "",
        stateMutability,
        visibility,
        fullText,
      });
      pos = j + 1;
      continue;
    }

    // standard function
    const sigMatch = fullText.match(
      /function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*([^{]*)\{/,
    );
    if (!sigMatch) {
      pos = j + 1;
      continue;
    }
    const _name = sigMatch[1] ?? "";
    const _params = sigMatch[2] ?? "";
    const _rest = sigMatch[3] ?? "";
    const _visibilityMatch = rest.match(/(public|external|internal|private)/);
    const _visibility = (visibilityMatch && visibilityMatch[1]) || "external";
    const _mutMatch = rest.match(/(view|pure|payable)/);
    const _stateMutability = mutMatch ? (mutMatch[1] as any) : "nonpayable";
    const _returnsMatch = rest.match(/returns\s*\(([^)]*)\)/);
    const _returnsClause = returnsMatch ? returnsMatch[0] : "";
    const _extraAttrMatch = rest.match(/\b(virtual|override(?:\s*\(.*?\))?)\b/g);
    const _extraAttrs = extraAttrMatch ? " " + extraAttrMatch.join(" ") : "";

    fns.push({
      name,
      signature: (
        fullText.slice(0, fullText.indexOf("{")).trim() + extraAttrs
      ).trim(),
      params,
      returnsClause,
      stateMutability: stateMutability as any,
      visibility,
      extraAttrs: extraAttrs.trim(),
      fullText,
    });

    pos = j + 1;
  }

  return fns;
}

function groupFunctions(fns: FnInfo[], corePattern?: string) {
  const core: FnInfo[] = [];
  const view: FnInfo[] = [];
  const logic: FnInfo[] = [];
  const pattern = corePattern
    ? new RegExp(corePattern, "i")
    : /init|owner|admin|pause|upgrade/i;

  for (const f of fns) {
    if (pattern.test(f.name)) core.push(f);
    else if (f.stateMutability === "view" || f.stateMutability === "pure")
      view.push(f);
    else logic.push(f);
  }

  const groups: { [k: string]: FnInfo[] } = {};
  if (core.length) groups.Core = core;
  if (view.length) groups.View = view;
  if (logic.length) groups.Logic = logic;
  return groups;
}

function generateFacetCode(
  baseName: string,
  facetName: string,
  fns: FnInfo[],
  pragmaAndImports: string,
  opts?: {
    libPath?: string;
    externalize?: boolean;
    noDispatchGuard?: boolean;
  },
) {
  const _contractName = `${baseName}${facetName}Facet`;
  const _interfaceName = `I${contractName}`;
  const spdx =
    pragmaAndImports.match(
      /^\s*\/\/\s*SPDX-License-Identifier:[^\r\n]*/m,
    )?.[0] ?? "// SPDX-License-Identifier: MIT";
  const pragmaLine =
    pragmaAndImports.match(/^\s*pragma\s+solidity\s+[^;]+;/m)?.[0] ??
    "pragma solidity ^0.8.0;";
  const _header = `${spdx}\n${pragmaLine}\n\n${pragmaAndImports.replace(/(^\s*pragma[\s\S]*?;\s*)/m, "")}\n`;
  const libImport = opts?.libPath
    ? opts.libPath
    : "../libraries/LibDiamond.sol";
  const _imports = `import {LibDiamond} from "${libImport}";\n`;

  const body = fns
    .map((f) => {
      const _params = f.params.trim();
      const _paramList = params.length ? params : "";
      const mut =
        f.stateMutability === "view" || f.stateMutability === "pure"
          ? f.stateMutability
          : f.stateMutability === "payable"
            ? "payable"
            : "";
      const mod =
        mut === "view" || mut === "pure"
          ? ""
          : opts?.noDispatchGuard
            ? ""
            : " onlyDispatcher";
      const _returnsClause = f.returnsClause ? ` ${f.returnsClause}` : "";
      const _vis = opts?.externalize ? "external" : f.visibility || "external";

      return `  function ${f.name}(${paramList}) ${vis}${mut ? " " + mut : ""}${mod}${returnsClause} {\n    revert("TODO: migrate logic from monolith");\n  }`;
    })
    .join("\n\n");

  const guardModifier = opts?.noDispatchGuard
    ? ""
    : `\n  modifier onlyDispatcher() {\n    LibDiamond.enforceManifestCall();\n    _;\n  }\n`;
  const _contract = `${header}${imports}\ncontract ${contractName} /* is ${interfaceName} */ {\n\n${guardModifier}\n${body}\n\n}\n`;

  return contract;
}

function writeFacet(outDir: string, contractName: string, content: string) {
  fs.mkdirSync(outDir, { recursive: true });
  const _fp = path.join(outDir, `${contractName}.sol`);
  fs.writeFileSync(fp, content, { encoding: "utf8" });
  return fp;
}

// --- CLI ---
if (require.main === module) {
  const _program = new Command();
  program
    .argument("<source>", "Solidity source file to split")
    .option("--out <path>", "output directory for facets")
    .option("--lib <path>", "path to LibDiamond import")
    .option("--externalize", "force external visibility on generated functions")
    .option("--no-dispatch-guard", "omit the onlyDispatcher modifier")
    .option(
      "--core-pattern <regex>",
      "regex to detect core functions (init/owner/admin)",
    )
    .option("--contract <name>", "specific contract name to extract")
    .parse(process.argv);

  const _opts = program.opts();
  const srcPath: string = (program.args && program.args[0]) || "";
  if (!srcPath) {
    console.error(
      "Usage: ts-node split-facet.ts <Contract.sol> [--out ./facets]",
    );
    process.exit(1);
  }

  const outDir = opts.out
    ? opts.out
    : path.join(path.dirname(srcPath), "..", "facets");

  if (!fs.existsSync(srcPath)) {
    console.error("Source file not found:", srcPath);
    process.exit(2);
  }

  const _raw = fs.readFileSync(srcPath, "utf8");
  const _cleaned = stripComments(raw);
  const _contractInfo = findContractInfo(cleaned, opts.contract);
  if (!contractInfo) {
    console.error("No contract declaration found in", srcPath);
    process.exit(3);
  }

  // gather pragma and import lines from original file header
  const pragmaAndImports = (contractInfo.header || "")
    .split("\n")
    .filter((l: string) => /pragma|import/.test(l))
    .join("\n");
  const _baseName = contractInfo.contractName.replace(/Contract$/, "");

  const _fns = extractFunctions(contractInfo.body);
  const _groups = groupFunctions(fns, opts.corePattern);

  if (Object.keys(groups).length === 0) {
    console.log("No functions found to split in", srcPath);
    process.exit(0);
  }

  for (const [groupName, list] of Object.entries(groups)) {
    const contractCode = generateFacetCode(
      baseName,
      groupName,
      list,
      pragmaAndImports,
      {
        libPath: opts.lib,
        externalize: !!opts.externalize,
        noDispatchGuard: !!opts.noDispatchGuard,
      },
    );
    const _fname = `${baseName}${groupName}Facet`;
    const _written = writeFacet(outDir, fname, contractCode);
    console.log("Wrote facet:", written);
  }

  console.log("Done. Generated facets for", srcPath);
}

// exports for testing
export {
  stripComments,
  findContractInfo,
  extractFunctions,
  groupFunctions,
  generateFacetCode,
};
