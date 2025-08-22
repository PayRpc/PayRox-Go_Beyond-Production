/*
 * PayRox Diamond Splitter – hyper‑robust TypeScript CLI
 * ------------------------------------------------------
 * Walks a directory, parses Solidity contracts via AST, detects public/external
 * functions + return types, computes 4‑byte selectors, then splits oversized
 * contracts into EIP‑2535-ready facet skeletons with:
 *   - Facet contracts (compilable, with stubbed functions that revert)
 *   - Interfaces per facet (I<FacetName>.sol)
 *   - Namespaced storage libs per facet (bytes32 SLOT = keccak256("payrox.facets.{name}.v1"))
 *   - A manifest.json mapping selectors → facet files
 *   - A diamondCut.json preview object (no addresses; for wiring later)
 *
 * Design choices:
 *   - Uses @solidity-parser/parser for accurate signatures.
 *   - Groups functions with First‑Fit Decreasing on estimated byte weight.
 *   - Enforces a conservative per‑facet source‑byte budget as a proxy for EIP‑170.
 *   - All file I/O is guarded; nothing is overwritten unless --force is given.
 *   - No external PayRox libs are hard‑required in the generated code to keep it buildable
 *     out‑of‑the‑box. Hooks are commented for later wiring to PayRoxAccessControlStorage,
 *     PayRoxPauseStorage, and init() routines.
 */

/* eslint-disable no-console */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import process from "process";

// Prefer the maintained fork; fallback to the older name if needed.
let SolidityParser: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SolidityParser = require("@solidity-parser/parser");
} catch (_e) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    SolidityParser = require("solidity-parser-antlr");
  } catch (e2) {
    console.error(
      "❌ Unable to load a Solidity parser. Please: npm i -D @solidity-parser/parser",
    );
    process.exit(1);
  }
}

// Small keccak helper w/out bringing ethers; Node >= 18 has crypto.subtle but sync here is fine.
function keccak256Hex(inputUtf8: string): string {
  // Using a pure JS keccak lib would be ideal; Node crypto does not ship keccak.
  // For broad compatibility we include a tiny fallback via 'keccak' if installed.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Keccak = require("keccak");
    const hash = new Keccak("keccak256").update(Buffer.from(inputUtf8, "utf8")).digest("hex");
    return "0x" + hash;
  } catch (_e) {
    console.error(
      "❌ Missing keccak implementation. Please: npm i -D keccak  (or use ethers for hashing)",
    );
    process.exit(1);
  }
}

// 4‑byte selector from canonical signature
function selectorOf(signature: string): string {
  const h = keccak256Hex(signature);
  return "0x" + h.slice(2, 10);
}

// ---------- Types ----------

type Visibility = "public" | "external" | "internal" | "private";

type StateMutability = "pure" | "view" | "payable" | "nonpayable";

interface FunctionInfo {
  name: string;
  signature: string; // canonical
  selector: string; // 0x........
  visibility: Visibility;
  stateMutability: StateMutability;
  returns: string; // Solidity returns clause (possibly empty)
  weight: number; // estimate for packing
  loc?: { start?: number; end?: number };
}

interface VariableInfo {
  line: string; // raw source line for comment preservation
}

interface ContractInfo {
  filePath: string;
  contractName: string;
  functions: FunctionInfo[];
  storageVars: VariableInfo[];
  sourceBytes: number;
}

interface SplitConfig {
  // If a contract's source exceeds this many bytes, we'll consider splitting
  maxContractSourceBytes: number; // default 20_000
  // Target per‑facet source byte budget (proxy for EIP‑170). If exceeded after grouping,
  // we create more facets. Default 18_000 to be conservative.
  targetFacetSourceBytes: number; // default 18_000
  outputDirectory: string; // default ./split-contracts
  generateInterfaces: boolean; // default true
  generateStorageLib: boolean; // default true
  forceOverwrite: boolean; // default false
  versionTag: string; // default 1.0.0
  pragma: string; // default 0.8.24 (widely supported)
}

interface ManifestEntry {
  contract: string;
  facet: string;
  file: string;
  signature: string;
  selector: string;
}

interface DiamondCutPreview {
  name: string;
  facets: Array<{
    facet: string;
    file: string;
    selectors: string[];
  }>;
}

// ---------- CLI Parsing ----------

function parseArgs(argv: string[]): {
  directory: string;
  config: SplitConfig;
} {
  const defaults: SplitConfig = {
    maxContractSourceBytes: 20_000,
    targetFacetSourceBytes: 18_000,
    outputDirectory: "./split-contracts",
    generateInterfaces: true,
    generateStorageLib: true,
    forceOverwrite: false,
    versionTag: "1.0.0",
    pragma: "0.8.24",
  };

  let directory = "./contracts";
  const config: SplitConfig = { ...defaults };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--directory" && argv[i + 1]) {
      directory = argv[++i];
    } else if (a === "--output" && argv[i + 1]) {
      config.outputDirectory = argv[++i];
    } else if (a === "--max-source" && argv[i + 1]) {
      config.maxContractSourceBytes = parseInt(argv[++i], 10);
    } else if (a === "--facet-source" && argv[i + 1]) {
      config.targetFacetSourceBytes = parseInt(argv[++i], 10);
    } else if (a === "--no-interfaces") {
      config.generateInterfaces = false;
    } else if (a === "--no-storage-lib") {
      config.generateStorageLib = false;
    } else if (a === "--force") {
      config.forceOverwrite = true;
    } else if (a === "--version" && argv[i + 1]) {
      config.versionTag = argv[++i];
    } else if (a === "--pragma" && argv[i + 1]) {
      config.pragma = argv[++i];
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { directory, config };
}

function printHelp() {
  console.log(`\nPayRox Diamond Splitter\nUsage: ts-node split-all.ts [options]\n\nOptions:\n  --directory <dir>     Directory to scan for .sol contracts (default ./contracts)\n  --output <dir>        Output directory for split facets (default ./split-contracts)\n  --max-source <bytes>  Source byte threshold to trigger splitting (default 20000)\n  --facet-source <bytes>Target per-facet source bytes (default 18000)\n  --no-interfaces       Do NOT generate interfaces\n  --no-storage-lib      Do NOT generate storage libraries\n  --force               Overwrite existing files\n  --version <tag>       Version string embedded in getFacetInfo (default 1.0.0)\n  --pragma <ver>        Solidity pragma (default 0.8.24)\n  -h, --help            Show help\n`);
}

// ---------- Filesystem Helpers ----------

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeWriteFileSync(p: string, data: string | Buffer, force = false) {
  if (fs.existsSync(p) && !force) {
    throw new Error(`Refusing to overwrite existing file: ${p} (use --force)`);
  }
  fs.writeFileSync(p, data);
}

function walkSolFiles(root: string): string[] {
  const out: string[] = [];
  function rec(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) rec(full);
      else if (e.isFile() && e.name.endsWith(".sol")) out.push(full);
    }
  }
  rec(root);
  return out;
}

// ---------- Solidity Type Canonicalization ----------

// Minimal canonical type stringification based on AST nodes.
function canonicalType(tn: any): string {
  if (!tn) return "";
  switch (tn.type) {
    case "ElementaryTypeName":
      // Normalize uint → uint256, int → int256 per ABI canonical rules
      if (tn.name === "uint") return "uint256";
      if (tn.name === "int") return "int256";
      return String(tn.name);
    case "UserDefinedTypeName":
      return String(tn.namePath);
    case "ArrayTypeName": {
      const base = canonicalType(tn.baseTypeName);
      const len = tn.length ? (tn.length.number ?? tn.length.value ?? "") : "";
      return `${base}[${len ?? ""}]`;
    }
    case "Mapping": {
      const key = canonicalType(tn.keyType);
      const val = canonicalType(tn.valueType);
      return `mapping(${key}=>${val})`;
    }
    case "FunctionTypeName": {
      const params = (tn.parameterTypes || []).map(canonicalType).join(",");
      const returns = (tn.returnTypes || []).map(canonicalType).join(",");
      return `function(${params})${returns ? ` returns(${returns})` : ""}`;
    }
    case "TupleTypeName": {
      const comps = (tn.components || []).map(canonicalType).join(",");
      return `tuple(${comps})`;
    }
    default:
      return "";
  }
}

function formatReturns(node: any): string {
  const params = node.returnParameters?.parameters ?? [];
  if (!params.length) return "";
  const types = params.map((p: any) => canonicalType(p.typeName));
  return `returns (${types.join(", ")})`;
}

function fmtVisibility(v: string | undefined): Visibility {
  const vv = (v || "public").toLowerCase();
  if (vv === "external" || vv === "internal" || vv === "private" || vv === "public") return vv;
  return "public";
}

function fmtMutability(m: string | undefined, modifiers: any[]): StateMutability {
  const mm = (m || "nonpayable").toLowerCase();
  if (mm === "view" || mm === "pure" || mm === "payable" || mm === "nonpayable") return mm;
  // infer from modifiers array if present
  const names = (modifiers || []).map((x) => x.name);
  if (names.includes("view")) return "view";
  if (names.includes("pure")) return "pure";
  if (names.includes("payable")) return "payable";
  return "nonpayable";
}

// ---------- AST Extraction ----------

function analyzeContract(filePath: string, source: string): ContractInfo[] {
  const ast = SolidityParser.parse(source, { tolerant: true, loc: true, range: true });
  const contracts: ContractInfo[] = [];

  SolidityParser.visit(ast, {
    ContractDefinition(node: any) {
      if (node.kind !== "contract") return; // skip interfaces/libraries here
      const contractName: string = node.name;
      const functions: FunctionInfo[] = [];
      const storageVars: VariableInfo[] = [];

      for (const sub of node.subNodes || []) {
        switch (sub.type) {
          case "FunctionDefinition": {
            if (sub.isConstructor || sub.kind === "constructor" || sub.kind === "fallback" || sub.kind === "receive") {
              continue;
            }
            const visibility = fmtVisibility(sub.visibility);
            if (visibility !== "public" && visibility !== "external") {
              continue; // only ABI‑exposed for Diamond routing
            }
            const name = sub.name || "";
            const params = (sub.parameters?.parameters ?? []).map((p: any) => canonicalType(p.typeName));
            const signature = `${name}(${params.join(",")})`;
            const selector = selectorOf(signature);
            const returns = formatReturns(sub);
            const mut = fmtMutability(sub.stateMutability, sub.modifiers ?? []);
            const weight = 220 + signature.length * 2 + (returns ? 30 : 0); // rough source‑weight heuristic
            functions.push({
              name,
              signature,
              selector,
              visibility,
              stateMutability: mut,
              returns,
              weight,
              loc: { start: sub.range?.[0], end: sub.range?.[1] },
            });
            break;
          }
          case "StateVariableDeclaration": {
            // Preserve raw lines as comments in storage lib for manual porting.
            const frag = source.slice(sub.range?.[0] ?? 0, (sub.range?.[1] ?? 0));
            storageVars.push({ line: frag.split("\n").map((l) => l.trim()).join(" ") });
            break;
          }
          default:
            break;
        }
      }

      contracts.push({
        filePath,
        contractName,
        functions,
        storageVars,
        sourceBytes: Buffer.byteLength(source, "utf8"),
      });
    },
  });

  return contracts;
}

// ---------- Packing (FFD) ----------

function packFunctionsIntoFacets(
  ci: ContractInfo,
  targetFacetSourceBytes: number,
): { facetName: string; funcs: FunctionInfo[] }[] {
  const sorted = [...ci.functions].sort((a, b) => b.weight - a.weight);
  const bins: { size: number; items: FunctionInfo[] }[] = [];

  for (const f of sorted) {
    let placed = false;
    for (const bin of bins) {
      if (bin.size + f.weight <= targetFacetSourceBytes) {
        bin.items.push(f);
        bin.size += f.weight;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push({ size: f.weight, items: [f] });
    }
  }

  // Name the facets sequentially
  return bins.map((bin, idx) => ({ facetName: `${ci.contractName}Facet${String.fromCharCode(65 + idx)}`, funcs: bin.items }));
}

// ---------- Generators ----------

function banner(pragma: string): string {
  return `// SPDX-License-Identifier: MIT\npragma solidity ^${pragma};\n`;
}

function genStorageLib(ci: ContractInfo, facetName: string, pragma: string): string {
  const ns = `payrox.facets.${facetName}.v1`;
  const commented = ci.storageVars
    .slice(0, 12)
    .map((v) => `// ${v.line}`)
    .join("\n    ");
  return `${banner(pragma)}
library ${facetName}Storage {
    bytes32 internal constant SLOT = keccak256("${ns}");

    struct Layout {
        // TODO: Port variables from original contract into this namespaced layout.
        // NOTE: Keep ordering identical to preserve storage compatibility.
        ${commented}
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 s = SLOT;
        assembly { l.slot := s }
    }
}
`;
}

function genInterface(facetName: string, funcs: FunctionInfo[], pragma: string): string {
  const sigs = funcs
    .map((f) => `    function ${f.signature} ${f.returns};`)
    .join("\n");
  return `${banner(pragma)}
interface I${facetName} {
${sigs ? sigs + "\n" : ""}}
`;
}

function genFacetContract(
  ci: ContractInfo,
  facetName: string,
  funcs: FunctionInfo[],
  versionTag: string,
  pragma: string,
  includeStorageImport: boolean,
): string {
  const imports = includeStorageImport ? `import { ${facetName}Storage } from "./libraries/${facetName}Storage.sol";` : "";

  const stubs = funcs
    .map((f) => {
      const mut = f.stateMutability === "nonpayable" ? "" : ` ${f.stateMutability}`;
      const vis = f.visibility; // preserve
      const ret = f.returns ? ` ${f.returns}` : "";
      return `    function ${f.signature} ${vis}${mut}${ret} { revert("PRX:NotImplemented"); }`;
    })
    .join("\n\n");

  const selectors = funcs
    .map((f, i) => `        selectors[${i}] = ${f.selector}; // ${f.signature}`)
    .join("\n");

  return `${banner(pragma)}
${imports ? imports + "\n\n" : ""}
/// @title ${facetName}
/// @notice Auto‑generated facet from ${path.basename(ci.filePath)}:${ci.contractName}
/// @dev Replace revert stubs with real logic, wire access control & pause guards.
contract ${facetName} {
    // Example modifiers for later wiring (no‑op to compile cleanly).
    // modifier onlyAdmin() { _; } // TODO: hook to PayRoxAccessControlStorage
    // modifier onlyOperator() { _; } // TODO: hook to PayRoxAccessControlStorage
    // modifier whenNotPaused() { _; } // TODO: hook to PayRoxPauseStorage

${stubs ? stubs + "\n\n" : ""}    function getFacetInfo()
        external
        pure
        returns (string memory name, string memory version, bytes4[] memory selectors)
    {
        name = "${facetName}";
        version = "${versionTag}";
        selectors = new bytes4[](${funcs.length});
${selectors}
    }
}
`;
}

// ---------- Main Splitter ----------

class ContractSplitter {
  constructor(private cfg: SplitConfig) {}

  splitAll = async (directory: string) => {
    console.log(`🔧 Scanning: ${directory}`);
    if (!isDir(directory)) throw new Error(`Not a directory: ${directory}`);

    const files = walkSolFiles(directory);
    if (!files.length) {
      console.log("ℹ️  No .sol files found.");
      return;
    }
    console.log(`📁 Found ${files.length} Solidity file(s).`);

    const manifest: ManifestEntry[] = [];
    const diamond: DiamondCutPreview = { name: path.basename(directory), facets: [] };
    ensureDir(this.cfg.outputDirectory);

    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const contractInfos = analyzeContract(file, source);
      for (const ci of contractInfos) {
        const needsSplit = ci.sourceBytes > this.cfg.maxContractSourceBytes || ci.functions.length > 0;
        if (!needsSplit) continue;

        const packs = packFunctionsIntoFacets(ci, this.cfg.targetFacetSourceBytes);

        const outDirForContract = path.join(this.cfg.outputDirectory, ci.contractName);
        ensureDir(outDirForContract);
        const libDir = path.join(outDirForContract, "libraries");
        const ifaceDir = path.join(outDirForContract, "interfaces");
        if (this.cfg.generateStorageLib) ensureDir(libDir);
        if (this.cfg.generateInterfaces) ensureDir(ifaceDir);

        for (const p of packs) {
          const facetPath = path.join(outDirForContract, `${p.facetName}.sol`);
          const facetSrc = genFacetContract(
            ci,
            p.facetName,
            p.funcs,
            this.cfg.versionTag,
            this.cfg.pragma,
            this.cfg.generateStorageLib,
          );
          safeWriteFileSync(facetPath, facetSrc, this.cfg.forceOverwrite);

          if (this.cfg.generateInterfaces) {
            const iSrc = genInterface(p.facetName, p.funcs, this.cfg.pragma);
            const iPath = path.join(ifaceDir, `I${p.facetName}.sol`);
            safeWriteFileSync(iPath, iSrc, this.cfg.forceOverwrite);
          }

          if (this.cfg.generateStorageLib) {
            const sSrc = genStorageLib(ci, p.facetName, this.cfg.pragma);
            const sPath = path.join(libDir, `${p.facetName}Storage.sol`);
            safeWriteFileSync(sPath, sSrc, this.cfg.forceOverwrite);
          }

          // Manifest aggregation
          const selectors = p.funcs.map((f) => f.selector);
          diamond.facets.push({ facet: p.facetName, file: path.relative(this.cfg.outputDirectory, facetPath), selectors });
          for (const f of p.funcs) {
            manifest.push({
              contract: ci.contractName,
              facet: p.facetName,
              file: path.relative(this.cfg.outputDirectory, facetPath),
              signature: f.signature,
              selector: f.selector,
            });
          }

          console.log(`📝 Generated facet: ${facetPath} (${p.funcs.length} function(s))`);
        }
      }
    }

    // Write manifest files at output root
    const manifestPath = path.join(this.cfg.outputDirectory, "manifest.json");
    const diamondPath = path.join(this.cfg.outputDirectory, "diamondCut.preview.json");
    safeWriteFileSync(manifestPath, JSON.stringify(manifest, null, 2), this.cfg.forceOverwrite);
    safeWriteFileSync(diamondPath, JSON.stringify(diamond, null, 2), this.cfg.forceOverwrite);
    console.log(`\n✅ Done. Manifest: ${manifestPath}`);
  };
}

// ---------- Entrypoint ----------

async function main() {
  const argv = process.argv.slice(2);
  const { directory, config } = parseArgs(argv);
  try {
    const splitter = new ContractSplitter(config);
    await splitter.splitAll(directory);
  } catch (err: any) {
    console.error("❌ Error:", err?.message || err);
    process.exit(1);
  }
}

if (process.argv[1] && path.basename(process.argv[1]).includes("split-all")) {
  // run only when executed as a script (keeps exportable for tests)
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}

export { ContractSplitter, SplitConfig, ContractInfo, FunctionInfo };
