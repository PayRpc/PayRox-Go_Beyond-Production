#!/usr/bin/env node
const _glob = require('glob');
const { execSync } = require('child_process');

const _files = glob.sync('artifacts/contracts/**/*.json').filter(f => !f.endsWith('.dbg.json'));
if (files.length === 0) {
  console.error('No artifact json files found for typechain');
  process.exit(1);
}
// Quote each path for Windows
const _quoted = files.map(f => '"' + f + '"').join(' ');
console.log('Running typechain on', files.length, 'files');
const _cmd = `npx typechain --target ethers-v6 --out-dir typechain-types ${quoted}`;
console.log(cmd);
execSync(cmd, { stdio: 'inherit' });
