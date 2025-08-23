#!/usr/bin/env ts-node
/**
 * Offline predictive pipeline:
 * - hardhat compile
 * - build predictive artifacts (Merkle/manifest)
 * - manifest selfcheck
 * - compute SHA256SUMS
 *
 * Repo-specific notes:
 * - buildMerkle.ts lives at tools/splitter/scripts/buildMerkle.ts
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function run(cmd: string, args: string[], opts: any = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts })
  if (typeof r.status === 'number' && r.status !== 0) process.exit(r.status || 1)
}

function runCapture(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], shell: true, encoding: 'utf8' })
  if (typeof r.status === 'number' && r.status !== 0) process.exit(r.status || 1)
  return r.stdout ?? ''
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

function latestSnapshot(dir: string, prefix: string): string | undefined {
  if (!existsSync(dir)) return
  const files = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json'))
  if (!files.length) return
  const ts = (f: string) => {
    const m = f.match(/(\d{10,})/)
    return m ? Number(m[1]) : statSync(join(dir, f)).mtimeMs
  }
  files.sort((a, b) => ts(b) - ts(a))
  return join(dir, files[0])
}

(async () => {
  const OUT = 'split-output'
  ensureDir(OUT)

  // 1) Compile
  run('npx', ['hardhat', 'compile'])

  // 2) Build predictive artifacts (root/manifest/proofs/plan/selectors)
  run('npx', ['ts-node', '--transpile-only', 'tools/splitter/scripts/buildMerkle.ts', 'predictive'])

  // 3) Selfcheck (Merkle only)
  run('npx', [
    'hardhat',
    'payrox:manifest:selfcheck',
    '--path',
    join(OUT, 'manifest.root.json'),
    '--json'
  ])

  // 4) Auto codehash diff if both snapshots exist
  const pred = latestSnapshot(OUT, 'codehashes-predictive-')
  const obs = latestSnapshot(OUT, 'codehashes-observed-')
  if (pred && obs) {
    run('npx', [
      'hardhat',
      'payrox:codehash:diff',
      '--predictive', pred,
      '--observed', obs,
      '--json'
    ])
  } else {
    console.log('ℹ️  Skipping codehash diff (need both predictive & observed snapshots).')
  }

  // 5) SHASUM bundle
  const sums = runCapture('node', ['scripts/ci/compute-shasums.js', OUT])
  writeFileSync(join(OUT, 'SHA256SUMS'), sums)
})();
