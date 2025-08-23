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

    // Build expected data from selectors.json
    const expectedFacets = new Map();
    const expectedSelectors = new Set();

    for (const [selector, route] of Object.entries(selectorsData)) {
      const facetAddr = route.facet;
      expectedSelectors.add(selector);

      if (!expectedFacets.has(facetAddr)) {
        expectedFacets.set(facetAddr, []);
      }
      expectedFacets.get(facetAddr).push(selector);
    }

    // Validate facet addresses
    const expectedAddresses = Array.from(expectedFacets.keys()).sort();
    const actualAddresses = loupeAddresses.map(addr => addr.toLowerCase()).sort();

    console.log(`📊 Expected facets: ${expectedAddresses.length}`);
    console.log(`📊 Loupe facets: ${actualAddresses.length}`);

    if (expectedAddresses.length !== actualAddresses.length) {
      throw new Error(`Facet count mismatch: expected ${expectedAddresses.length}, got ${actualAddresses.length}`);
    }

    for (let i = 0; i < expectedAddresses.length; i++) {
      if (expectedAddresses[i].toLowerCase() !== actualAddresses[i]) {
        throw new Error(`Facet address mismatch at index ${i}: expected ${expectedAddresses[i]}, got ${actualAddresses[i]}`);
      }
    }

    // Validate selectors per facet
    let totalSelectorsValidated = 0;

    for (const loupeFacet of loupeFacets) {
      const facetAddr = loupeFacet.facetAddress.toLowerCase();
      const expectedSelectorsForFacet = expectedFacets.get(facetAddr) || [];
      const actualSelectorsForFacet = loupeFacet.functionSelectors;

      console.log(`🔍 Validating ${facetAddr}: ${expectedSelectorsForFacet.length} selectors`);

      if (expectedSelectorsForFacet.length !== actualSelectorsForFacet.length) {
        throw new Error(`Selector count mismatch for ${facetAddr}: expected ${expectedSelectorsForFacet.length}, got ${actualSelectorsForFacet.length}`);
      }

      const expectedSet = new Set(expectedSelectorsForFacet.map(s => s.toLowerCase()));
      const actualSet = new Set(actualSelectorsForFacet.map(s => s.toLowerCase()));

      for (const expectedSel of expectedSet) {
        if (!actualSet.has(expectedSel)) {
          throw new Error(`Missing selector ${expectedSel} for facet ${facetAddr}`);
        }
      }

      for (const actualSel of actualSet) {
        if (!expectedSet.has(actualSel)) {
          throw new Error(`Unexpected selector ${actualSel} for facet ${facetAddr}`);
        }
      }

      totalSelectorsValidated += actualSelectorsForFacet.length;
    }

    console.log(`✅ Loupe parity validated: ${expectedFacets.size} facets, ${totalSelectorsValidated} selectors`);

    return {
      success: true,
      facetsValidated: expectedFacets.size,
      selectorsValidated: totalSelectorsValidated
    };

  } catch (error) {
    console.error(`❌ Loupe parity validation failed: ${error.message}`);
    if (process.env.CI) {
      process.exit(1);
    }
    return { success: false, error: error.message };
  }
}

// Run validation if called directly
if (require.main === module) {
  validateLoupeParity().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  });
}

module.exports = { validateLoupeParity };
