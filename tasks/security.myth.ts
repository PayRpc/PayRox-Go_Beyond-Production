import { task, types } from 'hardhat/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

type MythFinding = { swcID?: string; severity?: string; description?: string; address?: string; title?: string }

function mythCmd(): string {
  // Use Docker by default for cross-platform consistency; allow override with MYTH_CMD
  return process.env.MYTH_CMD ?? 'docker'
}

function mythImage(): string {
  // Pin Mythril image to avoid drift; allow override with MYTH_IMAGE
  return process.env.MYTH_IMAGE ?? 'mythril/myth:0.24.6'
}

function runMyth(args: string[]) {
  const cmd = mythCmd()
  const dockerArgs = [
    'run',
    '--rm',
    '-v', `${process.cwd()}:/proj`,
    '-w', '/proj',
    mythImage(),
    'myth',
    'analyze',
    ...args
  ]
  const result = cmd === 'docker' ? spawnSync('docker', dockerArgs, { encoding: 'utf8' }) : spawnSync(cmd, ['analyze', ...args], { encoding: 'utf8' })
  if (result.error) throw result.error
  return { code: result.status ?? 0, stdout: result.stdout, stderr: result.stderr }
}

function writeJson(file: string, data: any) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

function collectTargets(globsOrFiles: string[]): string[] {
  // Minimal collector: only accept explicit .sol files present on disk
  return globsOrFiles.filter((f) => fs.existsSync(f) && f.endsWith('.sol'))
}

function loadAllowlist(p?: string): { swc?: string[]; titles?: string[] } {
  if (!p) return {}
  if (!fs.existsSync(p)) return {}
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return {}
  }
}

function filterFindings(findings: MythFinding[], allow: { swc?: string[]; titles?: string[] }) {
  const swcSet = new Set((allow.swc ?? []).map((s) => s.toUpperCase()))
  const titleSet = new Set(allow.titles ?? [])
  return findings.filter((f) => !(swcSet.has((f.swcID ?? '').toUpperCase()) || titleSet.has(f.title ?? '')))
}

// --------------------- Scan sources (predictive) ----------------------
task('security:myth:src', 'Run Mythril on Solidity sources')
  .addOptionalParam('out', 'JSON report out path', 'split-output/mythril-src.json', types.string)
  .addOptionalParam('allow', 'Allowlist JSON path', 'security/allowlist.myth.json', types.string)
  .addOptionalParam('failOn', 'Severity threshold: high | medium', 'medium', types.string)
  .addOptionalVariadicPositionalParam('files', 'Files to scan (default set)', [])
  .setAction(async (args) => {
    const failOn = (args.failOn as string) || process.env.MYTH_FAIL_ON || 'medium'

    function shouldFail(sev: string): boolean {
      const severity = (sev || '').toLowerCase()
      if (failOn.toLowerCase() === 'high') return severity === 'high'
      return severity === 'high' || severity === 'medium'
    }

    const defaults = [
      'contracts/Proxy/PayRoxProxyRouter.sol',
      'contracts/manifest/ManifestDispatcher.sol',
      'contracts/factory/DeterministicChunkFactory.sol'
    ]
    const facetRoot = fs.existsSync('contracts/facets-fixed') ? 'contracts/facets-fixed' : 'contracts/facets'
    const facetFiles = fs.existsSync(facetRoot)
      ? fs
          .readdirSync(facetRoot)
          .filter((f) => f.endsWith('.sol'))
          .map((f) => `${facetRoot}/${f}`)
      : []
    const files: string[] = [...(args.files?.length ? args.files : [...defaults, ...facetFiles])]

    const allow = loadAllowlist(args.allow)
    const report: any[] = []
    let high = 0,
      medium = 0,
      blocked = 0

    console.log(`🔍 Mythril (src) gate: ${failOn.toUpperCase()}`)

    for (const file of collectTargets(files)) {
      const mythArgs = [
        file,
        '--solv',
        '0.8.30',
        '--execution-timeout',
        '180',
        '--max-depth',
        '32',
        '-o',
        'json'
      ]
      if (process.env.MYTH_SOLVER_TIMEOUT) mythArgs.push('--solver-timeout', process.env.MYTH_SOLVER_TIMEOUT)
      const { stdout, stderr } = runMyth(mythArgs)
      if (stderr?.trim()) console.warn(stderr)
      let json: any
      try {
        json = JSON.parse(stdout || '{}')
      } catch {
        json = {}
      }
      const findings: MythFinding[] = filterFindings(json?.issues ?? [], allow)
      report.push({ file, findings })
      for (const f of findings) {
        const sev = (f.severity ?? '').toLowerCase()
        if (sev === 'high') high++
        if (sev === 'medium') medium++
        if (shouldFail(sev)) blocked++
      }
    }    const buildId = process.env.BUILD_ID || process.env.GITHUB_RUN_ID || ''
    let outPath: string = args.out
    if (buildId) {
      const dir = path.dirname(args.out)
      const base = 'mythril-src'
      outPath = path.join(dir, `${base}.${buildId}.json`)
    }
    writeJson(outPath, { when: Date.now(), kind: 'src', report })
    // Write/update human-friendly latest copy
    const latestPath = path.join(path.dirname(args.out), 'mythril-src.latest.json')
    try {
      writeJson(latestPath, { when: Date.now(), kind: 'src', report })
    } catch (e) {
      // best-effort update; ignore failure
      void e
    }
    if (blocked > 0) {
      console.error(`❌ Mythril (src) gate (${failOn.toUpperCase()}) failed: ${blocked} blocking finding(s) (${high} high, ${medium} medium total)`)
      process.exit(1)
    }
    console.log(`✅ Mythril (src): no ${failOn.toUpperCase()}+ findings (${high} high, ${medium} medium found but ${failOn === 'high' ? 'medium allowed' : 'all gated'})`)
  })

// --------------------- Scan deployed addresses (observed) ----------------------
task('security:myth:addr', 'Run Mythril on deployed addresses (observed)')
  .addOptionalParam('rpc', 'RPC URL', 'http://127.0.0.1:8545', types.string)
  .addOptionalParam('in', 'deployed-addresses.json', 'split-output/deployed-addresses.json', types.string)
  .addOptionalParam('out', 'JSON report out path', 'split-output/mythril-addr.json', types.string)
  .addOptionalParam('allow', 'Allowlist JSON path', 'security/allowlist.myth.json', types.string)
  .addOptionalParam('failOn', 'Severity threshold: high | medium', 'medium', types.string)
  .setAction(async (args) => {
    const failOn = (args.failOn as string) || process.env.MYTH_FAIL_ON || 'medium'

    function shouldFail(sev: string): boolean {
      const severity = (sev || '').toLowerCase()
      if (failOn.toLowerCase() === 'high') return severity === 'high'
      return severity === 'high' || severity === 'medium'
    }

    if (!fs.existsSync(args.in)) {
      console.warn(`No deployed address map at ${args.in}; skipping Mythril (addr).`)
      return
    }
    const map = JSON.parse(fs.readFileSync(args.in, 'utf8'))
    const allow = loadAllowlist(args.allow)
    const addrs: string[] = Object.values(map)
    const report: any[] = []
    let high = 0,
      medium = 0,
      blocked = 0

    console.log(`🔍 Mythril (addr) gate: ${failOn.toUpperCase()}`)

    for (const addr of addrs) {
      const mythArgs = ['--rpc', args.rpc, '--address', addr, '--execution-timeout', '180', '--max-depth', '32', '-o', 'json']
      if (process.env.MYTH_SOLVER_TIMEOUT) mythArgs.push('--solver-timeout', process.env.MYTH_SOLVER_TIMEOUT)
      const { stdout, stderr } = runMyth(mythArgs)
      if (stderr?.trim()) console.warn(stderr)
      let json: any
      try {
        json = JSON.parse(stdout || '{}')
      } catch {
        json = {}
      }
      const findings: MythFinding[] = filterFindings(json?.issues ?? [], allow)
      report.push({ address: addr, findings })
      for (const f of findings) {
        const sev = (f.severity ?? '').toLowerCase()
        if (sev === 'high') high++
        if (sev === 'medium') medium++
        if (shouldFail(sev)) blocked++
      }
    }

    const buildId = process.env.BUILD_ID || process.env.GITHUB_RUN_ID || ''
    let outPath: string = args.out
    if (buildId) {
      const dir = path.dirname(args.out)
      const base = 'mythril-addr'
      outPath = path.join(dir, `${base}.${buildId}.json`)
    }
    writeJson(outPath, { when: Date.now(), kind: 'addr', report })
    const latestPath = path.join(path.dirname(args.out), 'mythril-addr.latest.json')
    try {
      writeJson(latestPath, { when: Date.now(), kind: 'addr', report })
    } catch (e) {
      // best-effort update; ignore failure
      void e
    }
    if (blocked > 0) {
      console.error(`❌ Mythril (addr) gate (${failOn.toUpperCase()}) failed: ${blocked} blocking finding(s) (${high} high, ${medium} medium total)`)
      process.exit(1)
    }
    console.log(`✅ Mythril (addr): no ${failOn.toUpperCase()}+ findings (${high} high, ${medium} medium found but ${failOn === 'high' ? 'medium allowed' : 'all gated'})`)
  })
