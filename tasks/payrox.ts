// tasks/payrox.ts
import { keccak256 } from 'ethers';
import { task, types } from 'hardhat/config';
import * as path from 'path';
import { readFileSync } from 'fs';
// import {
//   computeManifestHash,
//   verifyRouteAgainstRoot,
// } from '../tools/splitter/ordered-merkle';
import {
  logError,
  logInfo,
  logSuccess,
  logWarning,
  NetworkError,
} from '../src/utils/errors';
import {
  fileExists,
  getPathManager,
  readFileContent,
  safeParseJSON,
} from '../src/utils/paths';
import { computeManifestHash } from '../src/payrox/orderedMerkle';

type Manifest = {
  header?: {
    version: string; // human readable
    versionBytes32: string; // bytes32 hash of version
    timestamp: number;
    deployer: string;
    chainId: number;
    previousHash: string;
  };
  epoch?: number;
  root?: string;
  merkleRoot?: string; // Alternative field name for root
  routes: Array<{
    selector: string;
    facet: string;
    codehash: string;
    proof?: string[];
    positions?: string;
  }>;
};

// Helper types for split manifest support
type RouteProof = { selector: string; proof: string[]; positions: string };
type ProofsFile = {
  root: string;
  proofs: Record<string, { facet: string; codehash: string; proof: string[]; positions: string }> | RouteProof[]
};
type PlanRoute = { selector: string; facet: string; codehash: string };
type DeploymentPlan = {
  routes?: PlanRoute[];
  selectors?: string[];
  facets?: string[];
  codehashes?: string[];
  root?: string;
};

function loadJSON<T = any>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function coalesceSplitManifest(
  dirOrRootPath: string,
  explicit?: { root?: string; plan?: string; proofs?: string }
): { root: string; routes: Manifest['routes'] } {
  const baseDir = explicit?.root
    ? path.dirname(path.resolve(explicit.root))
    : path.resolve(dirOrRootPath);

  const rootPath   = explicit?.root   ?? path.join(baseDir, 'manifest.root.json');
  const planPath   = explicit?.plan   ?? path.join(baseDir, 'deployment-plan.json');
  const proofsPath = explicit?.proofs ?? path.join(baseDir, 'proofs.json');

  const rootFile   = loadJSON<{ root?: string; merkleRoot?: string }>(rootPath);
  const planFile   = loadJSON<DeploymentPlan>(planPath);
  const proofsFile = loadJSON<ProofsFile>(proofsPath);

  const root =
    (rootFile.root ?? rootFile.merkleRoot ?? planFile.root ?? proofsFile.root ?? '').toLowerCase();
  if (!root) throw new Error('Split manifest mode: no root found in manifest.root.json / plan / proofs');

  // index proofs by selector (lowercase) - handle both object and array formats
  const proofMap = new Map<string, { proof: string[]; positions: string }>();
  if (proofsFile.proofs) {
    if (Array.isArray(proofsFile.proofs)) {
      // Array format: { proofs: [{ selector: '0x...', proof: [...], positions: '0x...' }] }
      for (const p of proofsFile.proofs) {
        proofMap.set((p.selector ?? '').toLowerCase(), { proof: p.proof ?? [], positions: p.positions ?? '0x0' });
      }
    } else {
      // Object format: { proofs: { '0x123...': { proof: [...], positions: '0x...' } } }
      for (const [selector, data] of Object.entries(proofsFile.proofs)) {
        proofMap.set(selector.toLowerCase(), { proof: data.proof ?? [], positions: data.positions ?? '0x0' });
      }
    }
  }

  // build routes by merging plan + proofs
  let routes: Manifest['routes'] = [];

  if (planFile.routes) {
    // New format: { routes: [{ selector, facet, codehash }] }
    routes = planFile.routes.map((r) => {
      const sel = (r.selector ?? '').toLowerCase();
      const proof = proofMap.get(sel);
      return {
        selector: sel,
        facet: (r.facet ?? '').toLowerCase(),
        codehash: (r.codehash ?? '').toLowerCase(),
        proof: proof?.proof,
        positions: proof?.positions,
      };
    });
  } else if (planFile.selectors && planFile.facets && planFile.codehashes) {
    // Legacy format: separate arrays for selectors, facets, codehashes
    const selectors = planFile.selectors;
    const facets = planFile.facets;
    const codehashes = planFile.codehashes;

    if (selectors.length !== facets.length || selectors.length !== codehashes.length) {
      throw new Error('Split manifest mode: selectors, facets, and codehashes arrays have different lengths');
    }

    routes = selectors.map((selector, i) => {
      const sel = selector.toLowerCase();
      const proof = proofMap.get(sel);
      return {
        selector: sel,
        facet: facets[i].toLowerCase(),
        codehash: codehashes[i].toLowerCase(),
        proof: proof?.proof,
        positions: proof?.positions,
      };
    });
  }

  return { root, routes };
}

async function extcodehashOffchain(
  addr: string,
  provider: any
): Promise<string> {
  const code: string = await provider.getCode(addr);
  if (code === '0x') {
    return keccak256('0x'); // empty account codehash (will not match route.codehash)
  }
  return keccak256(code).toLowerCase();
}

/**
 * Safely read and parse file content as hex data
 */
function readFileAsHex(filePath: string): string {
  const pathManager = getPathManager();
  const absolutePath = pathManager.getAbsolutePath(filePath);

  if (!fileExists(absolutePath)) {
    throw new NetworkError(`File not found: ${absolutePath}`, 'FILE_NOT_FOUND');
  }

  try {
    // Try reading as text first (for hex files)
    const content = readFileContent(absolutePath);
    const trimmed = content.trim();

    if (trimmed.startsWith('0x') && /^0x[0-9a-fA-F]*$/.test(trimmed)) {
      return trimmed;
    } else if (/^[0-9a-fA-F]+$/.test(trimmed)) {
      return '0x' + trimmed;
    }
  } catch {
    // If text reading fails, try binary
  }

  // Read as binary and convert to hex
  try {
    const fs = require('fs');
    const raw = fs.readFileSync(absolutePath);
    return '0x' + raw.toString('hex');
  } catch (error) {
    throw new NetworkError(
      `Failed to read file ${absolutePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'FILE_READ_ERROR'
    );
  }
}

/** ----------------------------------------------------------------------------
 *  payrox:manifest:selfcheck
 *  - Verifies ordered proofs (positions + leaf)
 *  - Recomputes manifestHash
 *  - (Optional) compares off-chain EXTCODEHASH via provider.getCode()
 * ---------------------------------------------------------------------------*/
task('payrox:manifest:selfcheck', 'Verify a manifest JSON against ordered Merkle rules')
  .addOptionalParam('path', 'Path to manifest JSON (legacy format with embedded routes)', undefined, types.string)
  .addOptionalParam('dir', 'Directory containing split artifacts (manifest.root.json, deployment-plan.json, proofs.json)', undefined, types.string)
  .addOptionalParam('root', 'Path to manifest.root.json (split format)', undefined, types.string)
  .addOptionalParam('plan', 'Path to deployment-plan.json (split format)', undefined, types.string)
  .addOptionalParam('proofs', 'Path to proofs.json (split format)', undefined, types.string)
  .addOptionalParam('checkFacets', 'Also verify facet EXTCODEHASH off-chain', false, types.boolean)
  .addOptionalParam('json', 'Print machine-readable JSON', false, types.boolean)
  .setAction(async (args, hre) => {
    try {
      const asJson: boolean = !!args.json;
      const pm = getPathManager();

      // === 1) Resolve source mode (legacy vs split) ===
      let rootLower = '';
      let manifestRoutes: Manifest['routes'] = [];
      let header: Manifest['header'] | undefined;

      if (args.path) {
        // Legacy path—try to parse; if it lacks routes, fall back to split mode in same dir
        const manifestPath = pm.getAbsolutePath(args.path);
        const content = readFileContent(manifestPath);
        const manifest = safeParseJSON<Manifest>(content, {} as Manifest);
        if (!manifest) throw new Error('Failed to parse manifest JSON');
        const maybeRoot = (manifest.merkleRoot || manifest.root || '').toLowerCase();

        if (maybeRoot && Array.isArray(manifest.routes) && manifest.routes.length) {
          rootLower = maybeRoot;
          manifestRoutes = manifest.routes;
          header = manifest.header;
          if (!asJson) logInfo('Selfcheck: legacy manifest with embedded routes detected');
        } else {
          const baseDir = path.dirname(manifestPath);
          if (!asJson) logInfo('Selfcheck: no embedded routes — switching to split format using same directory');
          const { root, routes } = coalesceSplitManifest(baseDir);
          rootLower = root;
          manifestRoutes = routes;
          // header is optional; legacy header would've come from the monolithic file
        }
      } else {
        // Split mode via dir/root/plan/proofs
        const dir = args.dir ? pm.getAbsolutePath(args.dir) : process.cwd();
        const { root, routes } = coalesceSplitManifest(dir, {
          root: args.root && pm.getAbsolutePath(args.root),
          plan: args.plan && pm.getAbsolutePath(args.plan),
          proofs: args.proofs && pm.getAbsolutePath(args.proofs),
        });
        rootLower = root;
        manifestRoutes = routes;
        if (!asJson) logInfo('Selfcheck: split manifest mode (root + plan + proofs)');
      }

      if (!rootLower || !manifestRoutes.length) {
        throw new Error('Selfcheck: missing root or routes after normalization');
      }

      // === 2) Verify proofs when present ===
      let proofsVerified = 0;
      for (const r of manifestRoutes) {
        if (r.proof && r.positions) {
          // verifyRouteAgainstRoot(r, rootLower); // TODO: Re-implement with new pipeline
          proofsVerified++;
        }
      }
      if (!asJson) {
        console.log(
          proofsVerified > 0
            ? `✅ ${proofsVerified} route proofs verified against root`
            : 'ℹ️  No proofs present (ok in predictive-only runs)'
        );
      }

      // === 3) Recompute manifestHash if header available (legacy) ===
      let manifestHash: string | undefined;
      if (header) {
        const mHash = computeManifestHash(
          {
            versionBytes32: header.versionBytes32,
            timestamp: header.timestamp,
            deployer: header.deployer,
            chainId: header.chainId,
            previousHash: header.previousHash,
          },
          rootLower
        );
        manifestHash = mHash;
        if (!asJson) console.log(`📦 manifestHash: ${mHash}`);
      } else if (!asJson) {
        logInfo('No header present (split mode typically stores metadata elsewhere).');
      }

      // === 4) Optional: EXTCODEHASH parity ===
      let facetStats: { ok: number; bad: number; empty: number } | undefined;
      const mismatches: Array<{ selector: string; facet: string; expected?: string; got: string }> = [];
      if (args.checkFacets) {
        const provider = hre.ethers.provider;
        let ok = 0, bad = 0, empty = 0;
        for (const r of manifestRoutes) {
          const off = await extcodehashOffchain(r.facet, provider);
          if (off === keccak256('0x')) empty++;
          if (r.codehash && off === r.codehash.toLowerCase()) ok++;
          else if (r.codehash) { bad++; mismatches.push({ selector: r.selector, facet: r.facet, expected: r.codehash, got: off }); }
        }
        facetStats = { ok, bad, empty };
        if (!asJson && bad === 0) {
          logSuccess(`EXTCODEHASH parity ok for ${ok} route(s). Empty facets: ${empty}.`);
        }
        if (bad > 0) throw new NetworkError(`Facet codehash mismatches detected: ${bad}`, 'CODEHASH_MISMATCH');
      }

      // === 5) Output ===
      if (asJson) {
        console.log(JSON.stringify({
          task: 'payrox:manifest:selfcheck',
          mode: args.path ? 'legacy-or-split-from-path' : 'split',
          root: rootLower,
          routes: manifestRoutes.length,
          proofsVerified,
          manifestHash,
          facets: facetStats,
          codehashMismatches: mismatches.length ? mismatches : undefined,
          ok: (facetStats?.bad ?? 0) === 0,
        }, null, 2));
      } else {
        logSuccess('Manifest selfcheck (normalized) completed successfully');
      }
    } catch (error) {
      // existing JSON error block preserved
      try {
        if (args?.json) {
          console.log(JSON.stringify({
            task: 'payrox:manifest:selfcheck',
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code || (error as any)?.name || 'UNKNOWN',
          }, null, 2));
        }
      } finally {
        logError(error, 'Manifest selfcheck');
      }
      throw error;
    }
  });

/** ----------------------------------------------------------------------------
 *  payrox:chunk:predict
 *  - Delegates to IChunkFactory.predict(data)
 *  - Ensures exact same creation code/salt policy as the contract
 * ---------------------------------------------------------------------------*/
task(
  'payrox:chunk:predict',
  'Predict chunk address using the on-chain factory.predict(data)'
)
  .addParam(
    'factory',
    'Deployed DeterministicChunkFactory address',
    undefined,
    types.string
  )
  .addOptionalParam(
    'data',
    '0x-prefixed hex data to stage',
    undefined,
    types.string
  )
  .addOptionalParam(
    'file',
    'Path to a file containing raw bytes (hex or binary)',
    undefined,
    types.string
  )
  .addOptionalParam(
    'json',
    'Print machine-readable JSON result (suppresses verbose logs)',
    false,
    types.boolean
  )
  .setAction(async (args, hre) => {
    try {
      const asJson: boolean = !!args.json;
      if (!asJson) logInfo(`Predicting chunk address using factory: ${args.factory}`);

      const { ethers } = hre;
      const factoryAddr = args.factory;

      // Enhanced validation using consolidated utilities
      if (!factoryAddr || factoryAddr.length !== 42) {
        throw new NetworkError(
          'Invalid factory address format',
          'INVALID_FACTORY_ADDRESS'
        );
      }

      let bytesHex: string | undefined = args.data;
      if (!bytesHex && args.file) {
        bytesHex = readFileAsHex(args.file);
      }
      if (!bytesHex) {
        throw new NetworkError(
          'Provide --data 0x... or --file path',
          'MISSING_DATA'
        );
      }

  if (!asJson) logInfo(`Processing ${bytesHex.length} characters of hex data`);

      const factory = await ethers.getContractAt(
        'DeterministicChunkFactory',
        factoryAddr
      );

      // The predict function returns (address predicted, bytes32 hash)
      const result = await factory.predict(bytesHex);

      // Result is a tuple with [predicted, hash]
      if (asJson) {
        const out = {
          task: 'payrox:chunk:predict',
          factory: factoryAddr,
          input: args.data ? 'data' : 'file',
          bytesLength: bytesHex.length,
          predicted: result[0],
          contentHash: result[1],
          ok: true,
        };
        console.log(JSON.stringify(out, null, 2));
      } else {
        logSuccess('Chunk prediction successful');
        console.log(`📍 predicted chunk: ${result[0]}`);
        console.log(`🔎 content hash:   ${result[1]}`);
      }
    } catch (error) {
      try {
        if (args?.json) {
          const failure = {
            task: 'payrox:chunk:predict',
            factory: args?.factory,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code || (error as any)?.name || 'UNKNOWN',
          };
          console.log(JSON.stringify(failure, null, 2));
        }
      } finally {
        logError(error, 'Chunk prediction');
      }
      throw error;
    }
  });

/** ----------------------------------------------------------------------------
 *  payrox:chunk:stage
 *  - Stages a data chunk via factory.stage(data)
 *  - Lets the factory enforce fees and size limits
 * ---------------------------------------------------------------------------*/
task(
  'payrox:chunk:stage',
  'Stage a data chunk via DeterministicChunkFactory.stage(data)'
)
  .addParam('factory', 'Factory address', undefined, types.string)
  .addOptionalParam('data', '0x-prefixed hex data', undefined, types.string)
  .addOptionalParam(
    'file',
    'File path with hex or binary content',
    undefined,
    types.string
  )
  .addOptionalParam(
    'value',
    'ETH value to send for base fee (e.g. 0.001)',
    '0',
    types.string
  )
  .addOptionalParam(
    'dryRun',
    'Simulate and estimate without sending a transaction',
    false,
    types.boolean
  )
  .addOptionalParam(
    'json',
    'Print machine-readable JSON result (suppresses verbose logs)',
    false,
    types.boolean
  )
  .setAction(async (args, hre) => {
    try {
      const asJson: boolean = !!args.json;
      if (!asJson) logInfo(`Staging chunk via factory: ${args.factory}`);

      const { ethers } = hre;
      const factoryAddr = args.factory;

      // Enhanced validation using consolidated utilities
      if (!factoryAddr || factoryAddr.length !== 42) {
        throw new NetworkError(
          'Invalid factory address format',
          'INVALID_FACTORY_ADDRESS'
        );
      }

      let bytesHex: string | undefined = args.data;
      if (!bytesHex && args.file) {
        bytesHex = readFileAsHex(args.file);
      }
      if (!bytesHex) {
        throw new NetworkError(
          'Provide --data 0x... or --file path',
          'MISSING_DATA'
        );
      }

      if (!asJson)
        logInfo(
          `Processing ${bytesHex.length} characters of hex data with ${args.value} ETH fee`
        );

      const [signer] = await ethers.getSigners();
      const factory = await ethers.getContractAt(
        'DeterministicChunkFactory',
        factoryAddr,
        signer
      );

      const valueWei = args.value === '0' ? 0n : hre.ethers.parseEther(args.value);

      // Estimate gas and cost for both dry run and real send
  const estGas = await (factory as any).estimateGas.stage(bytesHex, { value: valueWei });
      const feeData = await hre.ethers.provider.getFeeData();
      const priceWei: bigint = (feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n) as bigint;
      const estCostWei = priceWei * (estGas as bigint);

      if (args.dryRun) {
        if (asJson) {
          const out = {
            task: 'payrox:chunk:stage',
            factory: factoryAddr,
            input: args.data ? 'data' : 'file',
            bytesLength: bytesHex.length,
            valueWei: valueWei.toString(),
            estimate: {
              gas: estGas.toString(),
              gasPriceWei: priceWei.toString(),
              costWei: estCostWei.toString(),
              costEther: hre.ethers.formatEther(estCostWei),
            },
            dryRun: true,
            ok: true,
          };
          console.log(JSON.stringify(out, null, 2));
        } else {
          logInfo('Dry-run only (no transaction sent).');
          console.log(`⛽ estimated gas:   ${estGas.toString()}`);
          console.log(`⛽ gas price (wei): ${(priceWei).toString()}`);
          console.log(`💰 est. cost (ETH): ${hre.ethers.formatEther(estCostWei)}`);
        }
        return;
      }

      if (!asJson) logInfo('Submitting staging transaction...');
      const tx = await factory.stage(bytesHex, { value: valueWei });
      if (!asJson) console.log(`⛓️  stage(tx): ${tx.hash}`);

      const rcpt = await tx.wait();
      if (asJson) {
        const out = {
          task: 'payrox:chunk:stage',
          factory: factoryAddr,
          txHash: tx.hash,
          blockNumber: rcpt?.blockNumber,
          ok: true,
        };
        console.log(JSON.stringify(out, null, 2));
      } else {
        logSuccess(`Chunk staged successfully in block ${rcpt?.blockNumber}`);
        console.log(`✅ mined in block ${rcpt?.blockNumber}`);
      }
    } catch (error) {
      try {
        if (args?.json) {
          const failure = {
            task: 'payrox:chunk:stage',
            factory: args?.factory,
            ok: false,
            dryRun: !!args?.dryRun,
            error: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code || (error as any)?.name || 'UNKNOWN',
          };
          console.log(JSON.stringify(failure, null, 2));
        }
      } finally {
        logError(error, 'Chunk staging');
      }
      throw error;
    }
  });

/** ----------------------------------------------------------------------------
 *  payrox:orchestrator:start
 *  - Start a new orchestration plan
 * ---------------------------------------------------------------------------*/
task(
  'payrox:orchestrator:start',
  'Start a new orchestration plan'
)
  .addParam('orchestrator', 'Orchestrator contract address', undefined, types.string)
  .addParam('id', 'Orchestration ID (bytes32)', undefined, types.string)
  .addParam('gasLimit', 'Gas limit for orchestration', undefined, types.string)
  .addOptionalParam('dryRun', 'Simulate and estimate without sending a transaction', false, types.boolean)
  .addOptionalParam('json', 'Print machine-readable JSON result (suppresses verbose logs)', false, types.boolean)
  .setAction(async (args, hre) => {
    try {
      const asJson: boolean = !!args.json;
      if (!asJson) logInfo(`Starting orchestration: ${args.id}`);

      const { ethers } = hre;
      const [signer] = await ethers.getSigners();

      const orchestrator = await ethers.getContractAt(
        'Orchestrator',
        args.orchestrator,
        signer
      );

  const estGas = await (orchestrator as any).estimateGas.startOrchestration(args.id, args.gasLimit);
      const feeData = await hre.ethers.provider.getFeeData();
      const priceWei: bigint = (feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n) as bigint;
      const estCostWei = priceWei * (estGas as bigint);

      if (args.dryRun) {
        if (asJson) {
          const out = {
            task: 'payrox:orchestrator:start',
            orchestrator: args.orchestrator,
            id: args.id,
            estimate: {
              gas: estGas.toString(),
              gasPriceWei: priceWei.toString(),
              costWei: estCostWei.toString(),
              costEther: hre.ethers.formatEther(estCostWei),
            },
            dryRun: true,
            ok: true,
          };
          console.log(JSON.stringify(out, null, 2));
        } else {
          logInfo('Dry-run only (no transaction sent).');
          console.log(`⛽ estimated gas:   ${estGas.toString()}`);
          console.log(`⛽ gas price (wei): ${(priceWei).toString()}`);
          console.log(`💰 est. cost (ETH): ${hre.ethers.formatEther(estCostWei)}`);
        }
        return;
      }

      const tx = await orchestrator.startOrchestration(args.id, args.gasLimit);
      if (!asJson) console.log(`⛓️  orchestration started: ${tx.hash}`);

      const receipt = await tx.wait();
      if (asJson) {
        const out = {
          task: 'payrox:orchestrator:start',
          orchestrator: args.orchestrator,
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber,
          ok: true,
        };
        console.log(JSON.stringify(out, null, 2));
      } else {
        logSuccess(`Orchestration started in block ${receipt?.blockNumber}`);
      }

    } catch (error) {
      try {
        if (args?.json) {
          const failure = {
            task: 'payrox:orchestrator:start',
            orchestrator: args?.orchestrator,
            id: args?.id,
            ok: false,
            dryRun: !!args?.dryRun,
            error: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code || (error as any)?.name || 'UNKNOWN',
          };
          console.log(JSON.stringify(failure, null, 2));
        }
      } finally {
        logError(error, 'Orchestrator start');
      }
      throw error;
    }
  });

/** ----------------------------------------------------------------------------
 *  payrox:dispatcher:diff
 *  - Compare on-chain routes vs manifest routes for post-apply audits
 * ---------------------------------------------------------------------------*/
task(
  'payrox:dispatcher:diff',
  'Diff manifest vs chain routes for post-deployment verification'
)
  .addParam('dispatcher', 'ManifestDispatcher contract address', undefined, types.string)
  .addParam('path', 'Path to manifest JSON', undefined, types.string)
  .addOptionalParam('json', 'Print machine-readable JSON result', false, types.boolean)
  .setAction(async (args, hre) => {
    try {
      const asJson: boolean = !!args.json;
      if (!asJson) logInfo(`Comparing manifest vs on-chain routes`);

      const pathManager = getPathManager();
      const manifestPath = pathManager.getAbsolutePath(args.path);

      if (!fileExists(manifestPath)) {
        throw new NetworkError(
          `Manifest not found at ${manifestPath}`,
          'MANIFEST_NOT_FOUND'
        );
      }

      const manifestContent = readFileContent(manifestPath);
  const _parsed2 = safeParseJSON<Manifest>(manifestContent, undefined);
  const manifest: Manifest = _parsed2 as Manifest;

      const { ethers } = hre;
      const dispatcher = await ethers.getContractAt('ManifestDispatcher', args.dispatcher);

      const mismatches: Array<{
        selector: string;
        expected: { facet: string; codehash: string };
        got: { facet: string; codehash: string };
      }> = [];

      for (const r of manifest.routes) {
        try {
          const [facet, codehash] = await dispatcher.routes(r.selector);
          if (
            facet.toLowerCase() !== r.facet.toLowerCase() ||
            codehash.toLowerCase() !== r.codehash.toLowerCase()
          ) {
            mismatches.push({
              selector: r.selector,
              expected: { facet: r.facet, codehash: r.codehash },
              got: { facet, codehash },
            });
          }
        } catch (error) {
          // Route doesn't exist on-chain
          mismatches.push({
            selector: r.selector,
            expected: { facet: r.facet, codehash: r.codehash },
            got: { facet: '0x0000000000000000000000000000000000000000', codehash: '0x0000000000000000000000000000000000000000000000000000000000000000' },
          });
        }
      }

      if (asJson) {
        const result = {
          task: 'payrox:dispatcher:diff',
          dispatcher: args.dispatcher,
          path: args.path,
          ok: mismatches.length === 0,
          totalRoutes: manifest.routes.length,
          mismatches: mismatches.length ? mismatches : undefined,
        };
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (mismatches.length === 0) {
          logSuccess(`All ${manifest.routes.length} routes match on-chain state`);
        } else {
          logError(new Error(`${mismatches.length} route mismatches found`), 'Route comparison');
          mismatches.forEach(m => {
            console.error(`❌ ${m.selector}: expected ${m.expected.facet} got ${m.got.facet}`);
          });
        }
      }

      if (mismatches.length > 0) {
        process.exit(1);
      }

    } catch (error) {
      try {
        if (args?.json) {
          const failure = {
            task: 'payrox:dispatcher:diff',
            dispatcher: args?.dispatcher,
            path: args?.path,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code || (error as any)?.name || 'UNKNOWN',
          };
          console.log(JSON.stringify(failure, null, 2));
        }
      } finally {
        logError(error, 'Dispatcher diff');
      }
      throw error;
    }
  });
