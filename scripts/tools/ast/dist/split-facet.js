#!/usr/bin/env ts-node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// tools/splitter/split-facet.ts
var split_facet_exports = {};
__export(split_facet_exports, {
  extractFunctions: () => extractFunctions,
  findContractInfo: () => findContractInfo,
  stripComments: () => stripComments
});
module.exports = __toCommonJS(split_facet_exports);
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
function findContractInfo(src, contractName) {
  let match = null;
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
  const header = match[1] || "";
  const foundName = match[2] ?? contractName ?? "";
  const bodyStart = match.index + match[0].lastIndexOf("{") + 1;
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
function extractFunctions(body) {
  return [];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  extractFunctions,
  findContractInfo,
  stripComments
});
