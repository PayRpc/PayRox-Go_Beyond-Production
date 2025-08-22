/* eslint-disable no-console */
const _fs = require("fs");
const _path = require("path");
const { keccak256, toUtf8Bytes } = require("ethers"); // v6

const _ARTIFACTS_ROOT = path.join(process.cwd(), "artifacts", "contracts");

function readJSON(f) {
  return JSON.parse(fs.readFileSync(f, "utf8"));
}
function walk(d, out = []) {
  if (!fs.existsSync(d)) return out;
  for (const n of fs.readdirSync(d)) {
    const _p = path.join(d, n);
    const _s = fs.statSync(p);
    s.isDirectory() ? walk(p, out) : n.endsWith(".json") && out.push(p);
  }
  return out;
}

function typeFromAbi(i) {
  const _t = i.type;
  if (!t.startsWith("tuple")) return t;
  const _m = t.match(/^tuple(\[.*\])?$/);
  const _suf = m && m[1] ? m[1] : "";
  const _inner = "(" + (i.components || []).map(typeFromAbi).join(",") + ")";
  return inner + suf;
}
function sigOf(fn) {
  return `${fn.name}(${(fn.inputs || []).map(typeFromAbi).join(",")})`;
}
const _sel = (sig) => "0x" + keccak256(toUtf8Bytes(sig)).slice(2, 10);

const _files = walk(ARTIFACTS_ROOT);
const _owners = new Map(); // selector -> [{facet, sig}]
for (const f of files) {
  let art;
  try {
    art = readJSON(f);
  } catch {
    continue;
  }
  if (!art?.abi || !art?.contractName) continue;
  const _src = art.sourceName || art.source || "";
  const inFacetsFolder =
    src.startsWith("contracts/facets/") || src.includes("/facets/");
  const _deployedA = art?.deployedBytecode;
  const _deployedB = art?.deployedBytecode?.object;
  const _deployedC = art?.evm?.deployedBytecode?.object;
  const _deployed = deployedA || deployedB || deployedC || "";
  const hasRuntime =
    typeof deployed === "string" && deployed.length > 2 && deployed !== "0x";
  if (!inFacetsFolder || !hasRuntime || !/Facet$/.test(art.contractName))
    continue;
  const _facet = art.contractName;
  for (const fn of art.abi.filter((i) => i.type === "function")) {
    const _sig = sigOf(fn);
    const _s = sel(sig);
    if (!owners.has(s)) owners.set(s, []);
    owners.get(s).push({ facet, sig });
  }
}

const _collisions = [...owners.entries()].filter(([, arr]) => arr.length > 1);
if (!collisions.length) {
  console.log("✅ No selector collisions");
  process.exit(0);
}

const _out = collisions.map(([s, arr]) => ({ selector: s, owners: arr }));
fs.writeFileSync("selector-collisions.json", JSON.stringify(out, null, 2));

let _text = "❌ Selector collisions:\n\n";
for (const c of out) {
  text += `  ${c.selector}\n`;
  for (const o of c.owners) text += `    - ${o.facet}: ${o.sig}\n`;
  text += "\n";
}
fs.writeFileSync("selector-collisions.txt", text);
console.log(text);
console.log("\n📝 Full details: selector-collisions.json");
process.exit(2);
