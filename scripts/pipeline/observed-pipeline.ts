#!/usr/bin/env ts-node
/**
 * Observed snapshot pipeline:
 * - expects facets deployed and addresses recorded (split-output/deployed-addresses.json)
 * - builds observed Merkle/manifest from live codehashes
 * - selfcheck
 * - SHA256SUMS
 */
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  if (typeof r.status === 'number' && r.status !== 0) process.exit(r.status || 1)
}

function runCapture(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], shell: true, encoding: 'utf8' })
  if (typeof r.status === 'number' && r.status !== 0) process.exit(r.status || 1)
  return r.stdout ?? ''
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
  return files.length > 0 ? join(dir, files[0]!) : undefined
}

function maybeSignAndVerify(manifestPath: string) {
  const key = process.env.SIGNER_KEY
  const dispatcher = process.env.DISPATCHER_ADDR
  const chainId = process.env.CHAIN_ID
  if (!key || !dispatcher) {
    console.log('ℹ️  Skipping manifest signing (need SIGNER_KEY and DISPATCHER_ADDR).')
    return
  }
  console.log('✍️  Signing manifest...')
  const signArgs = ['hardhat', 'payrox:manifest:sign', '--path', manifestPath, '--dispatcher', dispatcher, '--key', key, '--json']
  if (chainId) signArgs.push('--chain-id', chainId)
  run('npx', signArgs)

  console.log('🔎 Verifying signature...')
  run('npx', ['hardhat', 'payrox:manifest:verify', '--path', manifestPath, '--dispatcher', dispatcher, '--json'])
}

(async () => {
  const OUT = 'split-output'
  const ADDR = join(OUT, 'deployed-addresses.json')
  if (!existsSync(ADDR)) {
    console.error(`❌ Missing ${ADDR}. Deploy facets and save addresses first.`)
    process.exit(2)
  }

  // Build observed artifacts
  run('npx', [
    'ts-node',
    '--transpile-only',
    'tools/splitter/scripts/buildMerkle.ts',
    'observed'
  ])

  // Selfcheck (can enable --check-facets locally if you want to enforce EXTCODEHASH parity)
  run('npx', [
    'hardhat',
    'payrox:manifest:selfcheck',
    '--dir',
    OUT
  ])

  // 2.1) Optional signing + verification (guarded by env)
  maybeSignAndVerify(join(OUT, 'manifest.root.json'))

  // Auto codehash diff (fail on drift)
  const pred = latestSnapshot(OUT, 'codehashes-predictive-')
  const obs = latestSnapshot(OUT, 'codehashes-observed-')
  if (pred && obs) {
    run('npx', [
      'hardhat',
      'payrox:codehash:diff',
      '--predictive', pred,
      '--observed', obs
    ])
  } else {
    console.log('ℹ️  Skipping codehash diff (need both predictive & observed snapshots).')
  }

  // SHASUMS
  const sums = runCapture('node', ['scripts/ci/compute-shasums.js', OUT])
  writeFileSync(join(OUT, 'SHA256SUMS'), sums)
})();
