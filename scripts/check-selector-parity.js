// Ensures generated facets-fixed stubs have exact selector parity with split-output/selectors.json
const fs = require('fs');
const path = require('path');
const { id } = require('ethers');

function solType(i) {
  const t = i.type;
  const isArr = t.endsWith('[]');
  const base = isArr ? t.slice(0, -2) : t;
  if (base === 'tuple') {
    const comps = (i.components || []).map(solType).join(',');
    return `(${comps})${isArr ? '[]' : ''}`;
  }
  return t;
}

function collectArtifacts(dir) {
  const out = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (p.endsWith('.json')) out.push(p);
    }
  })(dir);
  return out;
}

function main() {
  const manifestPath = path.join(process.cwd(), 'split-output', 'selectors.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('[parity] selectors.json not found at split-output/selectors.json');
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const selectorEntries = (manifest.selectors || []).filter((s) => s.type === 'function');

  // Desired selectors per facet
  const desired = new Map(); // facet -> Set(selectors)
  for (const s of selectorEntries) {
    if (s.facet === 'IAntiBotFacet') continue;
    if (s.signature?.startsWith('getFacetFunctionSelectors')) continue;
    const k = s.facet;
    if (!desired.has(k)) desired.set(k, new Set());
    desired.get(k).add(s.selector.toLowerCase());
  }

  // Actual from artifacts
  const artifactsRoot = path.join(process.cwd(), 'artifacts', 'contracts', 'facets-fixed');
  const files = collectArtifacts(artifactsRoot);
  const actual = new Map(); // facet -> Set(selectors)
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const abi = Array.isArray(j.abi) ? j.abi : [];
      const name = path.basename(f).replace('.json', '');
      const sels = new Set();
      for (const frag of abi) {
        if (frag.type !== 'function' || !frag.name) continue;
        const types = (frag.inputs || []).map(solType).join(',');
        const sig = `${frag.name}(${types})`;
        const sel = id(sig).slice(0, 10).toLowerCase();
        sels.add(sel);
      }
      actual.set(name, sels);
    } catch (e) {
      // ignore malformed artifact
    }
  }

  // Compare
  let ok = true;
  for (const [facet, wantSet] of desired) {
    const have = actual.get(facet) || new Set();
    const missing = [...wantSet].filter((s) => !have.has(s));
    const extras = [...have].filter((s) => !wantSet.has(s));
    if (missing.length || extras.length) {
      ok = false;
      console.error(`[parity] ${facet}: missing=${missing.length} extras=${extras.length}`);
      if (missing.length) console.error('  missing:', missing.join(','));
      if (extras.length) console.error('  extras:', extras.join(','));
    }
  }
  if (!ok) process.exit(1);
  console.log('✅ Selector parity check passed for facets-fixed');
}

main();
