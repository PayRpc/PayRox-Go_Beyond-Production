#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function wrapLongStrings(obj, maxLen = 1000) {
  if (typeof obj === 'string') {
    if (obj.length > maxLen) {
      // Split into 1000-char chunks to keep lines manageable
      const parts = obj.match(new RegExp(`.{1,${maxLen}}`, 'g')) || [obj];
      return parts.join('\n');
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((v) => wrapLongStrings(v, maxLen));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = wrapLongStrings(obj[k], maxLen);
    return out;
  }
  return obj;
}

function processFile(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(raw);
  const wrapped = wrapLongStrings(data, 1000);
  const formatted = JSON.stringify(wrapped, null, 2) + '\n';
  fs.writeFileSync(p, formatted);
  console.log(`Prepared for spellcheck: ${p}`);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/spell/prepare-json-for-spellcheck.cjs <file...>');
  process.exit(1);
}
for (const f of files) processFile(path.resolve(f));
