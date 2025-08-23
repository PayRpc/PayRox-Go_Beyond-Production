// scripts/ci/validate-loupe-parity.js
// Usage:
//  node scripts/ci/validate-loupe-parity.js \
//    --dispatcher 0xDISPATCHER --rpc http://127.0.0.1:8545 \
//    --selectors ./split-output/selectors.json \
//    [--addresses ./split-output/deployed-addresses.json] \
//    [--plan ./split-output/deployment-plan.json] \
//    [--ignore-unrouted] [--strict-names]
//
// Exits non-zero on drift. Normalizes ordering & hex casing.

const fs = require("fs");
const { ethers } = require("ethers");

// ---------- CLI ----------
const args = process.argv.slice(2);
const getArg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : d;
};
const has = (k) => args.includes(k);

const DISPATCHER = getArg("--dispatcher");
const RPC = getArg("--rpc", "http://127.0.0.1:8545");
const SELECTORS_PATH = getArg("--selectors", "./split-output/selectors.json");
const ADDRESSES_PATH = getArg("--addresses", "./split-output/deployed-addresses.json");
const PLAN_PATH = getArg("--plan", "./split-output/deployment-plan.json");
const IGNORE_UNROUTED = has("--ignore-unrouted");
const STRICT_NAMES = has("--strict-names");

if (!DISPATCHER) {
  console.error("❌ --dispatcher is required");
  process.exit(2);
}

// ---------- Helpers ----------
const normHex = (h) => {
  if (!h) return h;
  let x = h.toLowerCase();
  if (!x.startsWith("0x")) x = "0x" + x;
  if ((x.length - 2) % 2) x = "0x0" + x.slice(2);
  return x;
};
const normAddr = (a) => (a ? ethers.getAddress(a) : a); // checksum normalize
const sortHexAsc = (arr) =>
  arr.map(normHex).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const uniq = (arr) => Array.from(new Set(arr));

const readJSON = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
};

// ---------- Load expected (selectors.json + address book) ----------
function buildAddressBook() {
  const book = {};
  // deployed-addresses.json: { "FacetName": "0x..." } or array of {name,address}
  const deployed = readJSON(ADDRESSES_PATH);
  if (deployed) {
    if (Array.isArray(deployed)) {
      for (const x of deployed) if (x?.name && x?.address) book[x.name] = normAddr(x.address);
    } else {
      for (const [k, v] of Object.entries(deployed)) if (v) book[k] = normAddr(v);
    }
  }
  // deployment-plan.json: { facets: [{ name, facet }, ...] }
  const plan = readJSON(PLAN_PATH);
  if (plan?.facets && Array.isArray(plan.facets)) {
    for (const f of plan.facets) if (f?.name && f?.facet) book[f.name] = normAddr(f.facet);
  }
  return book;
}

function loadExpected(selectorFile, addressBook) {
  const raw = readJSON(selectorFile);
  if (!raw) throw new Error(`Cannot read ${selectorFile}`);

  // Accept several shapes:
  // 1) { selectors: [{ selector, facet, facetAddress?, interfaceOnly? }, ...] }
  // 2) [{ selector, facet, ... }]
  // 3) { [selector]: "FacetName" }
  const entries = [];
  if (Array.isArray(raw)) entries.push(...raw);
  else if (Array.isArray(raw.selectors)) entries.push(...raw.selectors);
  else {
    for (const [sel, val] of Object.entries(raw)) {
      if (typeof val === "string") entries.push({ selector: sel, facet: val });
      else if (val && typeof val === "object") entries.push({ selector: sel, ...val });
    }
  }

  const expected = new Map(); // selector -> address
  const interfaceOnly = new Set();

  for (const e of entries) {
    const sel = normHex(e.selector);
    if (!sel || sel.length !== 10) continue;

    // prefer explicit facetAddress; else resolve name via addressBook
    let addr = e.facetAddress ? normAddr(e.facetAddress) : undefined;
    if (!addr && e.facet) addr = addressBook[e.facet];

    if (!addr) {
      // treat interface-only entries as skippable if flagged or if facet looks like an interface
      const flagged =
        e.interfaceOnly === true ||
        (typeof e.facet === "string" && /^I[A-Z].*/.test(e.facet));
      if (flagged) interfaceOnly.add(sel);
      else if (STRICT_NAMES) {
        throw new Error(`Missing address for selector ${sel} (facet=${e.facet ?? "?"})`);
      }
      continue;
    }

    expected.set(sel, addr);
  }

  return { expected, interfaceOnly };
}

// ---------- On-chain actual (loupe) ----------
const LOUPE_ABI = [
  "function facetAddresses() view returns (address[])",
  "function facetFunctionSelectors(address) view returns (bytes4[])",
  "function facetAddress(bytes4) view returns (address)",
  "function supportsInterface(bytes4) view returns (bool)"
];

async function fetchActual(provider, dispatcher) {
  const c = new ethers.Contract(dispatcher, LOUPE_ABI, provider);

  // Check interface support
  const loupeId = "0x48e2b093"; // IDiamondLoupe interface ID
  const loupeExId = "0x123456789"; // IDiamondLoupeEx interface ID (placeholder)

  try {
    const supportsLoupe = await c.supportsInterface(loupeId);
    const supportsLoupeEx = await c.supportsInterface(loupeExId);
    console.log(`🔍 Interface support: IDiamondLoupe=${supportsLoupe}, IDiamondLoupeEx=${supportsLoupeEx}`);
  } catch (e) {
    console.log("⚠️  supportsInterface() not available");
  }

  const addrs = await c.facetAddresses();
  const addrsNorm = uniq(addrs.map(normAddr)).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));

  const actual = new Map(); // selector -> address
  for (const a of addrsNorm) {
    const sels = await c.facetFunctionSelectors(a);
    const norm = sortHexAsc(sels.map(String));
    for (const s of norm) actual.set(s, a);
  }
  return actual;
}

// ---------- Compare ----------
function compare({ expected, actual, interfaceOnly }) {
  const expSelectors = new Set(expected.keys());
  const actSelectors = new Set(actual.keys());

  const missing = [];
  const extra = [];
  const mismatched = [];

  for (const s of expSelectors) {
    const expA = expected.get(s);
    const actA = actual.get(s);
    if (!actA) missing.push(s);
    else if (expA.toLowerCase() !== actA.toLowerCase()) mismatched.push({ selector: s, expected: expA, actual: actA });
  }

  for (const s of actSelectors) {
    if (!expected.has(s)) extra.push(s);
  }

  // Optional: drop interface-only or unrouted from "missing"
  let missingFiltered = missing;
  if (IGNORE_UNROUTED) {
    missingFiltered = missing.filter((s) => !interfaceOnly.has(s));
  }

  return { missing: missingFiltered, extra, mismatched };
}

// ---------- Main ----------
(async () => {
  try {
    console.log("🔍 Validating Loupe Parity (Deterministic Ordering)...");
    console.log(`📍 Dispatcher: ${DISPATCHER}`);
    console.log(`🌐 RPC: ${RPC}`);
    console.log(`📄 Selectors: ${SELECTORS_PATH}`);
    console.log(`🏠 Addresses: ${ADDRESSES_PATH || "none"}`);
    console.log(`📋 Plan: ${PLAN_PATH || "none"}`);
    console.log(`🚫 Ignore unrouted: ${IGNORE_UNROUTED}`);
    console.log(`⚡ Strict names: ${STRICT_NAMES}`);
    console.log("");

    const provider = new ethers.JsonRpcProvider(RPC);
    const addressBook = buildAddressBook();
    console.log(`📖 Address book entries: ${Object.keys(addressBook).length}`);

    const { expected, interfaceOnly } = loadExpected(SELECTORS_PATH, addressBook);
    console.log(`📊 Expected selectors: ${expected.size}, Interface-only: ${interfaceOnly.size}`);

    const actual = await fetchActual(provider, normAddr(DISPATCHER));
    console.log(`🎯 Actual selectors: ${actual.size}`);

    // Normalize (ordering already canonical by construction)
    const { missing, extra, mismatched } = compare({ expected, actual, interfaceOnly });

    const ok = missing.length === 0 && extra.length === 0 && mismatched.length === 0;
    if (ok) {
      console.log("✅ Loupe parity OK - Perfect alignment!");
      console.log(`   ✓ Expected selectors: ${expected.size}`);
      console.log(`   ✓ Actual selectors: ${actual.size}`);
      console.log(`   ✓ Interface-only excluded: ${interfaceOnly.size}`);
      process.exit(0);
    }

    // Report drift
    console.error("\n❌ Loupe parity FAILED - State divergence detected!");
    if (missing.length) {
      console.error(`\n🔴 Missing selectors (${missing.length}):`);
      for (const sel of missing.slice(0, 10)) {
        console.error(`     ${sel} → expected ${expected.get(sel)}`);
      }
      if (missing.length > 10) console.error(`     ...and ${missing.length - 10} more`);
    }

    if (extra.length) {
      console.error(`\n🟡 Extra selectors (${extra.length}):`);
      for (const sel of extra.slice(0, 10)) {
        console.error(`     ${sel} → unexpected ${actual.get(sel)}`);
      }
      if (extra.length > 10) console.error(`     ...and ${extra.length - 10} more`);
    }

    if (mismatched.length) {
      console.error(`\n🔄 Mismatched routes (${mismatched.length}):`);
      for (const m of mismatched.slice(0, 10)) {
        console.error(`     ${m.selector}: expected ${m.expected} → actual ${m.actual}`);
      }
      if (mismatched.length > 10) console.error(`     ...and ${mismatched.length - 10} more`);
    }

    console.error("\n💡 Tip: Run 'npm run compile' and re-deploy to fix state drift");
    process.exit(1);
  } catch (e) {
    console.error("❌ Parity script error:", e?.message || e);
    if (e.stack) console.error(e.stack);
    process.exit(2);
  }
})();
