// Simple EIP-170 runtime bytecode size gate for generated facet stubs
// Scans artifacts for contracts under contracts/facets-fixed and ensures deployedBytecode <= 24576 bytes
const fs = require('fs');
const path = require('path');

function collectArtifacts(dir) {
  const out = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (p.endsWith('.json')) out.push(p);
    }
  })(dir);
  return out;
}

function main() {
  const root = path.join(process.cwd(), 'artifacts', 'contracts', 'facets-fixed');
  const files = collectArtifacts(root);
  if (files.length === 0) {
    console.warn('[size-check] No artifacts found under artifacts/contracts/facets-fixed. Did you compile?');
    process.exit(2);
  }
  const LIMIT = 24576; // bytes
  let ok = true;
  const report = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const bytecode = j.deployedBytecode || j.bytecode || '0x';
      const bytes = bytecode === '0x' ? 0 : (bytecode.length - 2) / 2;
      report.push({ file: f, bytes });
      if (bytes > LIMIT) {
        ok = false;
        console.error(`[EIP-170] ${path.basename(f)} exceeds limit: ${bytes}B > ${LIMIT}B`);
      }
    } catch (e) {
      // ignore bad json
    }
  }
  // Summary
  report.sort((a, b) => b.bytes - a.bytes);
  console.log('\n[size-check] Facet sizes (bytes):');
  for (const r of report) {
    console.log(` - ${path.basename(r.file)}: ${r.bytes}`);
  }
  if (!ok) process.exit(1);
  console.log('\n✅ EIP-170 size check passed for facets-fixed');
}

main();
