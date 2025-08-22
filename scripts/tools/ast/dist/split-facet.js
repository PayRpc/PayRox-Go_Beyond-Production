#!/usr/bin/env ts-node
"use strict";
var ___create = Object.create;
var ___defProp = Object.defineProperty;
var ___getOwnPropDesc = Object.getOwnPropertyDescriptor;
var ___getOwnPropNames = Object.getOwnPropertyNames;
var ___getProtoOf = Object.getPrototypeOf;
var ___hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var ___toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// tools/splitter/split-facet.ts
var _split_facet_exports = {};
__export(split_facet_exports, {
  extractFunctions: () => extractFunctions,
  findContractInfo: () => findContractInfo,
  generateFacetCode: () => generateFacetCode,
  groupFunctions: () => groupFunctions,
  stripComments: () => stripComments
});
module.exports = __toCommonJS(split_facet_exports);
var _fs = __toESM(require("fs"));
var _path = __toESM(require("path"));
var _import_commander = require("commander");
function findBalancedBlock(s, start) {
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
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
function findContractInfo(src, contractName) {
  let _match = null;
  if (contractName) {
    const re = new RegExp(
      "([\\s\\S]*?)contract\\s+" + contractName + "\\s*(?:is[^{]*)?\\s*\\{"
    );
    match = src.match(re);
  }
  if (!match) {
    match = src.match(
      /([\s\S]*?)contract\s+([A-Za-z0-9_]+)\s*(?:is[^{]*)?\s*\{/
    );
  }
  if (!match) return null;
  const _header = match[1] || "";
  const _foundName = match[2] ?? contractName ?? "";
  const _bodyStart = match.index + match[0].lastIndexOf("{") + 1;
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
function extractFunctions(body) {
  const _fns = [];
  let _pos = 0;
  const _keywords = ["function", "constructor", "fallback", "receive"];
  while (pos < body.length) {
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
    if (/\w/.test(body[idx - 1] || "")) {
      pos = idx + foundKw.length;
      continue;
    }
    const _sigStart = idx;
    if (foundKw === "function") {
      const _braceIdx2 = body.indexOf("{", sigStart);
      const _semicolonIdx = body.indexOf(";", sigStart);
      if (semicolonIdx !== -1 && (braceIdx2 === -1 || semicolonIdx < braceIdx2)) {
        const _fullSig = body.slice(sigStart, semicolonIdx + 1).trim();
        const m = fullSig.match(
          /function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*([^;]*)/s
        );
        if (m) {
          const _name2 = m[1] ?? "";
          const _params2 = m[2] ?? "";
          const _rest2 = m[3] ?? "";
          const visibilityMatch2 = rest2.match(
            /(public|external|internal|private)/
          );
          const _visibility2 = visibilityMatch2 && visibilityMatch2[1] || "external";
          const _mutMatch2 = rest2.match(/(view|pure|payable)/);
          const _stateMutability2 = mutMatch2 ? mutMatch2[1] : "nonpayable";
          const extraAttrMatch2 = rest2.match(
            /\b(virtual|override(?:\s*\(.*?\))?)\b/g
          );
          const _extraAttrs2 = extraAttrMatch2 ? " " + extraAttrMatch2.join(" ") : "";
          fns.push({
            name: name2,
            signature: (fullSig + extraAttrs2).trim(),
            params: params2,
            returnsClause: "",
            stateMutability: stateMutability2,
            visibility: visibility2,
            extraAttrs: extraAttrs2.trim(),
            fullText: fullSig
          });
        }
        pos = semicolonIdx + 1;
        continue;
      }
    }
    const _braceIdx = body.indexOf("{", sigStart);
    if (braceIdx === -1) {
      pos = sigStart + foundKw.length;
      continue;
    }
    const _j = findBalancedBlock(body, braceIdx);
    if (j === -1) break;
    const _fullText = body.slice(sigStart, j + 1).trim();
    if (foundKw === "constructor") {
      const _sigMatch2 = fullText.match(/constructor\s*\(([^)]*)\)\s*([^{]*)\{/s);
      const _params2 = sigMatch2 ? sigMatch2[1] ?? "" : "";
      const _rest2 = sigMatch2 ? sigMatch2[2] ?? "" : "";
      const _visibilityMatch2 = rest2.match(/(public|external|internal|private)/);
      const _visibility2 = visibilityMatch2 && visibilityMatch2[1] || "public";
      fns.push({
        name: "constructor",
        signature: fullText.slice(0, fullText.indexOf("{")).trim(),
        params: params2,
        returnsClause: "",
        stateMutability: "nonpayable",
        visibility: visibility2,
        fullText
      });
      pos = j + 1;
      continue;
    }
    if (foundKw === "fallback" || foundKw === "receive") {
      const _name2 = foundKw;
      const sigMatch2 = fullText.match(
        /(?:fallback|receive)\s*\(\s*\)\s*([^{]*)\{/
      );
      const _rest2 = sigMatch2 ? sigMatch2[1] ?? "" : "";
      const _visibilityMatch2 = rest2.match(/(public|external|internal|private)/);
      const _visibility2 = visibilityMatch2 && visibilityMatch2[1] || "external";
      const _mutMatch2 = rest2.match(/(payable)/);
      const _stateMutability2 = mutMatch2 ? mutMatch2[1] : "nonpayable";
      fns.push({
        name: name2,
        signature: fullText.slice(0, fullText.indexOf("{")).trim(),
        params: "",
        returnsClause: "",
        stateMutability: stateMutability2,
        visibility: visibility2,
        fullText
      });
      pos = j + 1;
      continue;
    }
    const sigMatch = fullText.match(
      /function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*([^{]*)\{/
    );
    if (!sigMatch) {
      pos = j + 1;
      continue;
    }
    const _name = sigMatch[1] ?? "";
    const _params = sigMatch[2] ?? "";
    const _rest = sigMatch[3] ?? "";
    const _visibilityMatch = rest.match(/(public|external|internal|private)/);
    const _visibility = visibilityMatch && visibilityMatch[1] || "external";
    const _mutMatch = rest.match(/(view|pure|payable)/);
    const _stateMutability = mutMatch ? mutMatch[1] : "nonpayable";
    const _returnsMatch = rest.match(/returns\s*\(([^)]*)\)/);
    const _returnsClause = returnsMatch ? returnsMatch[0] : "";
    const _extraAttrMatch = rest.match(/\b(virtual|override(?:\s*\(.*?\))?)\b/g);
    const _extraAttrs = extraAttrMatch ? " " + extraAttrMatch.join(" ") : "";
    fns.push({
      name,
      signature: (fullText.slice(0, fullText.indexOf("{")).trim() + extraAttrs).trim(),
      params,
      returnsClause,
      stateMutability,
      visibility,
      extraAttrs: extraAttrs.trim(),
      fullText
    });
    pos = j + 1;
  }
  return fns;
}
function groupFunctions(fns, corePattern) {
  const _core = [];
  const _view = [];
  const _logic = [];
  const _pattern = corePattern ? new RegExp(corePattern, "i") : /init|owner|admin|pause|upgrade/i;
  for (const f of fns) {
    if (pattern.test(f.name)) core.push(f);
    else if (f.stateMutability === "view" || f.stateMutability === "pure")
      view.push(f);
    else logic.push(f);
  }
  const _groups = {};
  if (core.length) groups.Core = core;
  if (view.length) groups.View = view;
  if (logic.length) groups.Logic = logic;
  return groups;
}
function generateFacetCode(baseName, facetName, fns, pragmaAndImports, opts) {
  const _contractName = `${baseName}${facetName}Facet`;
  const _interfaceName = `I${contractName}`;
  const spdx = pragmaAndImports.match(
    /^\s*\/\/\s*SPDX-License-Identifier:[^\r\n]*/m
  )?.[0] ?? "// SPDX-License-Identifier: MIT";
  const _pragmaLine = pragmaAndImports.match(/^\s*pragma\s+solidity\s+[^;]+;/m)?.[0] ?? "pragma solidity ^0.8.0;";
  const header = `${spdx}
${pragmaLine}

${pragmaAndImports.replace(/(^\s*pragma[\s\S]*?;\s*)/m, "")}
`;
  const _libImport = opts?.libPath ? opts.libPath : "../libraries/LibDiamond.sol";
  const _imports = `import {LibDiamond} from "${libImport}";
`;
  const body = fns.map((f) => {
    const _params = f.params.trim();
    const _paramList = params.length ? params : "";
    const _mut = f.stateMutability === "view" || f.stateMutability === "pure" ? f.stateMutability : f.stateMutability === "payable" ? "payable" : "";
    const _mod = mut === "view" || mut === "pure" ? "" : opts?.noDispatchGuard ? "" : " onlyDispatcher";
    const _returnsClause = f.returnsClause ? ` ${f.returnsClause}` : "";
    const _vis = opts?.externalize ? "external" : f.visibility || "external";
    return `  function ${f.name}(${paramList}) ${vis}${mut ? " " + mut : ""}${mod}${returnsClause} {
    revert("TODO: migrate logic from monolith");
  }`;
  }).join("\n\n");
  const guardModifier = opts?.noDispatchGuard ? "" : `
  modifier onlyDispatcher() {
    LibDiamond.enforceManifestCall();
    _;
  }
`;
  const contract = `${header}${imports}
contract ${contractName} /* is ${interfaceName} */ {

${guardModifier}
${body}

}
`;
  return contract;
}
function writeFacet(outDir, contractName, content) {
  fs.mkdirSync(outDir, { recursive: true });
  const _fp = path.join(outDir, `${contractName}.sol`);
  fs.writeFileSync(fp, content, { encoding: "utf8" });
  return fp;
}
if (require.main === module) {
  const _program = new import_commander.Command();
  program.argument("<source>", "Solidity source file to split").option("--out <path>", "output directory for facets").option("--lib <path>", "path to LibDiamond import").option("--externalize", "force external visibility on generated functions").option("--no-dispatch-guard", "omit the onlyDispatcher modifier").option(
    "--core-pattern <regex>",
    "regex to detect core functions (init/owner/admin)"
  ).option("--contract <name>", "specific contract name to extract").parse(process.argv);
  const _opts = program.opts();
  const _srcPath = program.args && program.args[0] || "";
  if (!srcPath) {
    console.error(
      "Usage: ts-node split-facet.ts <Contract.sol> [--out ./facets]"
    );
    process.exit(1);
  }
  const _outDir = opts.out ? opts.out : path.join(path.dirname(srcPath), "..", "facets");
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
  const _pragmaAndImports = (contractInfo.header || "").split("\n").filter((l) => /pragma|import/.test(l)).join("\n");
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
        noDispatchGuard: !!opts.noDispatchGuard
      }
    );
    const _fname = `${baseName}${groupName}Facet`;
    const _written = writeFacet(outDir, fname, contractCode);
    console.log("Wrote facet:", written);
  }
  console.log("Done. Generated facets for", srcPath);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  extractFunctions,
  findContractInfo,
  generateFacetCode,
  groupFunctions,
  stripComments
});
