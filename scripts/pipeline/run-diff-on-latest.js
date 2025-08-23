#!/usr/bin/env node
// Runs payrox:codehash:diff against the latest predictive and observed snapshots in split-output.
const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');

function latestSnapshot(dir, prefix) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
  if (!files.length) return;
  const ts = (f) => {
    const m = f.match(/(\d{10,})/);
    return m ? Number(m[1]) : statSync(join(dir, f)).mtimeMs;
  };
  files.sort((a, b) => ts(b) - ts(a));
  return join(dir, files[0]);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (typeof r.status === 'number' && r.status !== 0) process.exit(r.status || 1);
}

(function main() {
  const OUT = 'split-output';
  const pred = latestSnapshot(OUT, 'codehashes-predictive-');
  const obs = latestSnapshot(OUT, 'codehashes-observed-');
  if (!pred || !obs) {
    console.error('❌ Need both predictive and observed snapshots in split-output to run diff.');
    process.exit(2);
  }
  run('npx', ['hardhat', 'payrox:codehash:diff', '--predictive', pred, '--observed', obs, '--json']);
})();
