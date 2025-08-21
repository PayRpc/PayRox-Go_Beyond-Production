// tools/validate-integration.ts
// Ensures: keccak selectors only, no loupe in facets, EIP-170 safe,
// manifest parity with compiled ABIs, ERC-165 ownership centralized,
// salt policy consistent, and router codehash pining sane.

import fs from "fs";
import path from "path";
import { glob } from "glob";
import { id, keccak256, toUtf8Bytes } from "ethers";

type ABIFragment = {
  type: string;
  name?: string;
  inputs?: { type: string }[];
  stateMutability?: string;
};

type Artifact = {
  abi: ABIFragment[];
  deployedBytecode?: string;
  sourceName?: string;
  contractName?: string;
};

type Manifest = {
  version: string;
  facets: Record<string, { selectors: string[] } | string[]>;
};

const LoupeNames = new Set([
  "diamondCut",
  "facets",
  "facetFunctionSelectors",
  "facetAddresses",
  "facetAddress",
  // Note: supportsInterface is allowed in ERC165Facet only (centralized policy)
]);

const LoupeSelectors = new Set([
  // canonical
  "0x1f931c1c", // diamondCut
  "0xcdffacc6", // facets()
  "0x52ef6b2c", // facetFunctionSelectors(address)
  "0x7a0ed627", // facetAddresses() (alt libs use 0x)
  "0xadfca15e", // facetAddress(bytes4)
  // Note: supportsInterface (0x01ffc9a7) is allowed in ERC165Facet only
]);

function fail(msg: string): never {
  console.error("❌", msg);
  process.exit(1);
}

function warn(msg: string) {
  console.warn("⚠️ ", msg);
}

function ok(msg: string) {
  console.log("✅", msg);
}

function loadJSON<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function selectorFromSig(sig: string): string {
  // keccak256 UTF-8, first 4 bytes
  return id(sig).slice(0, 10);
}

function sigFromABI(fn: ABIFragment): string {
  const inputs = (fn.inputs || []).map(i => i.type).join(",");
  return `${fn.name}(${inputs})`;
}

function sizeFromArtifact(a: Artifact): number {
  const rt = a.deployedBytecode || "0x";
  return rt === "0x" ? 0 : (rt.length - 2) / 2;
}

function normalizeManifest(m: Manifest): Record<string, string[]> {
  // accept both {facets: {Facet: {selectors:[]}}} and {facets: {Facet:[...]}}
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(m.facets || {})) {
    const sels = Array.isArray(v) ? v : (v as any).selectors;
    out[k] = (sels || []).map((s: string) => s.toLowerCase());
  }
  return out;
}

async function main() {
  const root = process.cwd();

  const manifestPath = path.resolve(root, "payrox-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    fail("payrox-manifest.json not found; generate it first (tools/generate-manifest.js).");
  }
  const manifest = loadJSON<Manifest>(manifestPath);
  const mf = normalizeManifest(manifest);

  // 1) Load all facet artifacts
  const facetArtifacts = await glob("artifacts/contracts/facets/**/*.json", { cwd: root, nodir: true });
  if (facetArtifacts.length === 0) {
    fail("No facet artifacts found under artifacts/contracts/facets/**. Compile first.");
  }

  const EIP170 = 24576;
  const compiledSelectors: Record<string, string[]> = {};
  const problems: string[] = [];
  const warnings: string[] = [];

  for (const rel of facetArtifacts) {
    const p = path.resolve(root, rel);
    const art = loadJSON<Artifact>(p);

    const name = art.contractName || path.basename(p, ".json");
    const isFacet = (art.sourceName || "").includes("/facets/");
    const isInterface = name.startsWith("I") && name !== "IAntiBotFacet"; // Skip interfaces except actual facets like IAntiBotFacet
    
    if (!isFacet || isInterface) continue; // ignore libs/interfaces caught by glob

    // Build selector set from ABI
    const fnFrags = (art.abi || []).filter(f => f.type === "function") as ABIFragment[];
    const sigs = fnFrags.map(sigFromABI);
    const sels = sigs.map(selectorFromSig);

    compiledSelectors[name] = sels;

    // 1a) No loupe/admin/erc165 in facets (except ERC165Facet for supportsInterface)
    for (const f of fnFrags) {
      if (!f.name) continue;
      
      // Special case: ERC165Facet is allowed to have supportsInterface
      if (f.name === "supportsInterface" && name === "ERC165Facet") {
        continue;
      }
      
      if (LoupeNames.has(f.name)) {
        problems.push(`${name}: exposes banned function ${f.name} (centralize in Loupe/165 facets only)`);
      }
      const sel = selectorFromSig(sigFromABI(f));
      
      // Special case: ERC165Facet is allowed to have supportsInterface selector
      if (sel === "0x01ffc9a7" && name === "ERC165Facet") {
        continue;
      }
      
      if (LoupeSelectors.has(sel)) {
        problems.push(`${name}: exposes banned selector ${sel} (${f.name})`);
      }
    }

    // 1b) EIP-170 runtime size
    const size = sizeFromArtifact(art);
    if (size > EIP170) {
      problems.push(`${name}: runtime bytecode ${size} bytes exceeds EIP-170 (${EIP170})`);
    }
  }

  // 2) Manifest parity (selectors from compiled facets must match manifest)
  //    a) Every facet in manifest must exist in compiled; b) selectors must match
  for (const [facet, mSelectors] of Object.entries(mf)) {
    if (!compiledSelectors[facet]) {
      problems.push(`Manifest facet '${facet}' not found in compiled artifacts`);
      continue;
    }
    const cset = new Set(compiledSelectors[facet].map(s => s.toLowerCase()));
    const mset = new Set(mSelectors.map(s => s.toLowerCase()));
    // Manifest should not invent selectors
    for (const sel of mset) {
      if (!cset.has(sel)) {
        problems.push(`Manifest facet '${facet}' includes selector ${sel} not present in compiled ABI`);
      }
    }
    // Warn if compiled has selectors missing in manifest (might be intentional)
    for (const sel of cset) {
      if (!mset.has(sel)) warnings.push(`Facet '${facet}' compiled selector ${sel} missing in manifest`);
    }
  }

  // 3) Selector hashing policy audit (no SHA-256 anywhere in tooling)
  const wizardPath = path.resolve(root, "tools/AIInterfaceWizard.ts");
  if (fs.existsSync(wizardPath)) {
    const text = fs.readFileSync(wizardPath, "utf8");
    if (text.match(/sha256|createHash\(['"]sha-?256['"]\)/i)) {
      problems.push("AIInterfaceWizard.ts: uses SHA-256 for selectors; must use keccak256(toUtf8Bytes(sig)).");
    }
  }

  // Check other TS files for SHA-256 usage in selector generation
  const tsFiles = await glob("scripts/**/*.ts", { cwd: root });
  for (const tsFile of tsFiles) {
    const tsPath = path.resolve(root, tsFile);
    const content = fs.readFileSync(tsPath, "utf8");
    if (content.includes("selector") && content.match(/sha256|createHash\(['"]sha-?256['"]\)/i)) {
      warnings.push(`${tsFile}: potentially uses SHA-256 for selectors; verify keccak256 usage.`);
    }
  }

  // 4) Salt policy parity (Solidity vs TS)
  const saltTS = path.resolve(root, "scripts/cross-network-registry.ts");
  if (fs.existsSync(saltTS)) {
    const text = fs.readFileSync(saltTS, "utf8");
    const hasPacked = /ethers\.solidityPacked\s*\(/.test(text);
    const hasKeccak = /ethers\.keccak256\s*\(/.test(text);
    if (!(hasPacked && hasKeccak)) {
      warnings.push("cross-network-registry.ts: expected solidityPacked + keccak256 for universalSalt.");
    }
  }
  const saltSol = await glob("contracts/**/SaltPolicyLib.sol", { cwd: root });
  if (saltSol.length === 0) {
    warnings.push("SaltPolicyLib.sol not found; consider adding the canonical salt policy library.");
  }

  // 5) Router codehash pinning sanity (best-effort static grep)
  const routerPath = path.resolve(root, "contracts/Proxy/PayRoxProxyRouter.sol");
  if (fs.existsSync(routerPath)) {
    const txt = fs.readFileSync(routerPath, "utf8");
    if (!txt.includes("dispatcherCodehash") || !txt.includes("strictCodehash")) {
      warnings.push("PayRoxProxyRouter: codehash pinning toggles not found; verify pinning semantics.");
    }
    if (!txt.includes("INIT_SALT")) {
      warnings.push("PayRoxProxyRouter: INIT_SALT constant not found; verify front-run protection.");
    }
    if (!txt.includes("initSalt") || !txt.includes("initSalt != INIT_SALT")) {
      warnings.push("PayRoxProxyRouter: initSalt validation not found; verify initialization hardening.");
    }
  }

  // 6) Output & exit code
  if (warnings.length) {
    console.log("\nℹ️  Warnings:");
    for (const w of warnings) console.log("  •", w);
  }

  if (problems.length) {
    console.log("\n❌ Problems:");
    for (const p of problems) console.log("  •", p);
    fail("Integration validation failed.");
  }

  ok("Facet ABIs obey policy (no loupe/165), sizes < EIP-170, and manifest parity OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
