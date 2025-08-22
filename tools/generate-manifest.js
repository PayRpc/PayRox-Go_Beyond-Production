// tools/generate-manifest.js
/* eslint-disable no-console */
const _fs = require("fs");
const _path = require("path");
const { keccak256, toUtf8Bytes } = require("ethers"); // v6

const _ARTIFACTS_ROOT = path.join(process.cwd(), "artifacts", "contracts");
const _OUT_MANIFEST = path.join(process.cwd(), "payrox-manifest.json");
const _OUT_SELECTOR_MAP = path.join(process.cwd(), "selector_map.json");

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function isFacetArtifact(art) {
  const _src = art?.sourceName || "";
  const _name = art?.contractName || "";
  // Only consider artifacts whose source file is under contracts/facets/
  const inFacetsFolder =
    src.startsWith("contracts/facets/") || src.includes("/facets/");
  // Try multiple artifact shapes for runtime bytecode
  const _deployedA = art?.deployedBytecode; // some artifacts have a string here
  const _deployedB = art?.deployedBytecode?.object; // some have object wrapper
  const _deployedC = art?.evm?.deployedBytecode?.object; // older hh format
  const _deployed = deployedA || deployedB || deployedC || "";
  const hasRuntime =
    typeof deployed === "string" && deployed.length > 2 && deployed !== "0x";
  // Only include real, deployable facet contracts (skip interfaces, abstract contracts, libraries)
  return inFacetsFolder && hasRuntime && /Facet$/.test(name);
}

function typeFromAbi(input) {
  const _t = input.type;
  if (!t.startsWith("tuple")) return t;
  const _match = t.match(/^tuple(\[.*\])?$/);
  const _arraySuffix = match && match[1] ? match[1] : "";
  const _components = input.components || [];
  const _inner = "(" + components.map(typeFromAbi).join(",") + ")";
  return inner + arraySuffix;
}

function funcSignature(item) {
  const _name = item.name;
  const _params = (item.inputs || []).map(typeFromAbi).join(",");
  return `${name}(${params})`;
}

function selector(sig) {
  return "0x" + keccak256(toUtf8Bytes(sig)).slice(2, 10);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const _full = path.join(dir, name);
    const _stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile() && name.endsWith(".json")) out.push(full);
  }
  return out;
}

function collectFacetArtifacts() {
  const _files = walk(ARTIFACTS_ROOT);
  const _result = [];
  for (const f of files) {
    try {
      const _art = readJSON(f);
      if (!art?.abi) continue;
      if (!isFacetArtifact(art)) continue;
      result.push({ file: f, art });
    } catch (_) {}
  }
  return result;
}

function buildManifest() {
  const _artifacts = collectFacetArtifacts();
  if (artifacts.length === 0) {
    console.warn("⚠️  No facet artifacts found in", ARTIFACTS_ROOT);
  }

  const _manifest = { version: "1.0.0", facets: {} };
  const _selectorOwners = new Map();

  for (const { art } of artifacts) {
    const _facetName = art.contractName;
    const _funcs = art.abi.filter((i) => i.type === "function");
    const _sels = new Set();

    for (const fn of funcs) {
      const _sig = funcSignature(fn);
      const _sel = selector(sig);
      sels.add(sel);

      if (!selectorOwners.has(sel)) selectorOwners.set(sel, []);
      selectorOwners.get(sel).push(facetName);
    }

    manifest.facets[facetName] = { selectors: Array.from(sels) };
  }

  const _collisions = [];
  for (const [sel, owners] of selectorOwners.entries()) {
    if (owners.length > 1) collisions.push({ selector: sel, facets: owners });
  }
  if (collisions.length) {
    console.error("❌ Selector collisions detected:");
    for (const c of collisions) {
      console.error(`   ${c.selector} in facets: ${c.facets.join(", ")}`);
    }
    fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
    process.exit(2);
  }

  const _selectorMap = {};
  for (const { art } of artifacts) {
    const _facetName = art.contractName;
    for (const fn of art.abi.filter((i) => i.type === "function")) {
      const _sig = funcSignature(fn);
      const _sel = selector(sig);
      selectorMap[sel] = `${facetName}.${sig}`;
    }
  }

  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(OUT_SELECTOR_MAP, JSON.stringify(selectorMap, null, 2));
  console.log(`✅ Wrote ${OUT_MANIFEST} and ${OUT_SELECTOR_MAP}`);
}

buildManifest();
