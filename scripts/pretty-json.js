#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function prettyFile(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(raw);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  console.log(`Pretty-printed ${p}`);
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Usage: node scripts/pretty-json.js <file ...>');
  process.exit(1);
}
for (const t of targets) {
  const p = path.resolve(t);
  prettyFile(p);
}
