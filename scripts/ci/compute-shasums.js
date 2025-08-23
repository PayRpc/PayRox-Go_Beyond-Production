// usage: node scripts/ci/compute-shasums.js split-output > split-output/SHA256SUMS
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.argv[2] || 'split-output';
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name !== 'SHA256SUMS') yield p;  // Exclude SHA256SUMS file itself
  }
}
for (const fp of walk(root)) {
  const data = fs.readFileSync(fp);
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  console.log(`${sha}  ${fp}`);
}
