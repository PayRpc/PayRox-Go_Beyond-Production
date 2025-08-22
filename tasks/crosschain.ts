import fs from 'fs';
import path from 'path';
// tasks/crosschain.ts
// SPDX-License-Identifier: MIT
/**
 * Cross-Chain Deployment Hardhat Tasks (audited)
 *
 * - Consistent TS imports (no .js mixed paths)
 * - Propagate --force
 * - Validate networks and manifest path
 * - Safer result printing
 */

import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

type DeployFullArgs = {
  networks?: string;
  manifest?: string;
  dryrun?: boolean;
  skipfactory?: boolean;
  skipmanifest?: boolean;
  force?: boolean;
  governance?: string;
};

type DeployFactoryArgs = {
  networks?: string;
  validate?: boolean;
};

type ValidateManifestArgs = {
  manifest: string;
  networks?: string;
  output?: string;
};

type CleanupArgs = {
  networks?: string;
  reports?: boolean;
  force?: boolean;
};

const _DEFAULT_NETWORKS = 'sepolia,base-sepolia,arbitrum-sepolia';

function parseNetworks(hre: HardhatRuntimeEnvironment, csv?: string): string[] {
  const _list = (csv || DEFAULT_NETWORKS).split(',').map((n) => n.trim()).filter(Boolean);
  const _known = new Set(Object.keys(hre.config.networks));
  const _unknown = list.filter((n) => !known.has(n));
  if (unknown.length) {
    throw new Error(
      `Unknown network(s): ${unknown.join(', ')}. Known: ${Array.from(known).join(', ')}`
    );
  }
  return list;
}

/* ════════════════════════════════════════════════════════════
   TASK: FULL CROSS-CHAIN DEPLOYMENT ORCHESTRATION
   ════════════════════════════════════════════════════════════ */
task('crosschain:deploy-full', 'Execute complete cross-chain deployment runbook')
  .addOptionalParam('networks', 'Comma-separated list of networks', DEFAULT_NETWORKS)
  .addOptionalParam('manifest', 'Path to manifest JSON file', '')
  .addFlag('dryrun', 'Run validation without actual deployment')
  .addFlag('skipfactory', 'Skip factory deployment')
  .addFlag('skipmanifest', 'Skip manifest validation')
  .addFlag('force', 'Force deployment even if warnings exist')
  .addOptionalParam('governance', 'Custom governance address', '')
  .setAction(async (taskArgs: DeployFullArgs, hre: HardhatRuntimeEnvironment) => {
    console.log('🎭 PayRox Go Beyond - Full Cross-Chain Deployment');
    console.log('='.repeat(65));

    const _networks = parseNetworks(hre, taskArgs.networks);

    // Enforce manifest presence unless explicitly skipped
    const _manifestPath = taskArgs.manifest?.trim() || undefined;
    if (!taskArgs.skipmanifest) {
      if (!manifestPath) throw new Error('Manifest path is required (or pass --skipmanifest).');
      const _fs = await import('fs');
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest file not found: ${manifestPath}`);
      }
    }

    const config = {
      networks,
      manifestPath,
      skipFactoryDeployment: !!taskArgs.skipfactory,
      skipManifestValidation: !!taskArgs.skipmanifest,
      dryRun: !!taskArgs.dryrun,
      pausedDeployment: true, // default safety
      governanceAddress: taskArgs.governance?.trim() || undefined,
      force: !!taskArgs.force, // propagate!
    };

    try {
      // Dynamic imports to avoid config loading issues
      const { main: orchestrateDeployment } = await import('../scripts/orchestrate-crosschain');
      const result: any = await orchestrateDeployment(hre, config);

      if (result?.success) {
        console.log('\n🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!');
        if (result.factoryAddress) console.log(`📍 Factory Address: ${result.factoryAddress}`);
        if (typeof result.duration === 'number') console.log(`⏱️  Duration: ${result.duration}ms`);

        console.log('\n📊 NETWORK RESULTS:');
        const _entries = Object.entries(result.deploymentResults || {});
        for (const [network, netResultRaw] of entries) {
          const netResult: any = netResultRaw || {};
          const errs: string[] = Array.isArray(netResult.errors) ? netResult.errors : [];
          const _status = errs.length === 0 ? '✅' : '❌';
          console.log(
            `   ${status} ${network}: Factory(${!!netResult.factoryDeployed}) Dispatcher(${!!netResult.dispatcherDeployed}) Manifest(${!!netResult.manifestValidated})`
          );
          for (const e of errs) console.log(`      Error: ${e}`);
        }

        return result.factoryAddress;
      }
      throw new Error('Deployment failed - see logs for details');
    } catch (error) {
      console.error('❌ Deployment failed:', error);
      throw error;
    }
  });

/* ════════════════════════════════════════════════════════════
   TASK: DETERMINISTIC FACTORY DEPLOYMENT
   ════════════════════════════════════════════════════════════ */
task('crosschain:deploy-factory', 'Deploy DeterministicChunkFactory with identical addresses')
  .addOptionalParam('networks', 'Comma-separated list of networks', DEFAULT_NETWORKS)
  .addFlag('validate', 'Only validate address parity without deployment')
  .setAction(async (taskArgs: DeployFactoryArgs, hre: HardhatRuntimeEnvironment) => {
    console.log('🏭 Deterministic Factory Deployment');
    console.log('='.repeat(50));

    const _networks = parseNetworks(hre, taskArgs.networks);
    console.log(`🌐 Target networks: ${networks.join(', ')}`);

    try {
      if (taskArgs.validate) {
        console.log('🔍 Validation mode - checking address parity only');

        // Dynamic import to avoid config loading issues
        const { DeterministicFactoryDeployer } = await import(
          '../scripts/deploy-deterministic-factory'
        );
        const _deployer = new DeterministicFactoryDeployer();

        const parityResult: any = await deployer.validateFactoryAddressParity(networks, hre);

        if (parityResult?.valid) {
          console.log(`✅ Factory address parity validated: ${parityResult.expectedAddress}`);
          return parityResult.expectedAddress;
        }
        throw new Error('Factory address parity validation failed');
      }

      // Dynamic import to avoid config loading issues
      const { main: deployDeterministicFactory } = await import('../scripts/deploy-deterministic-factory');
      const _factoryAddress = await deployDeterministicFactory(hre, { networks });
      console.log(`✅ Factory deployed at identical address: ${factoryAddress}`);
      return factoryAddress;
    } catch (error) {
      console.error('❌ Factory deployment failed:', error);
      throw error;
    }
  });

/* ════════════════════════════════════════════════════════════
   TASK: MANIFEST PREFLIGHT VALIDATION
   ════════════════════════════════════════════════════════════ */
task('crosschain:validate-manifest', 'Run manifest preflight validation across networks')
  .addParam('manifest', 'Path to manifest JSON file')
  .addOptionalParam('networks', 'Comma-separated list of networks', DEFAULT_NETWORKS)
  .addOptionalParam('output', 'Output path for validation report', '')
  .setAction(async (taskArgs: ValidateManifestArgs, hre: HardhatRuntimeEnvironment) => {
    console.log('📋 Manifest Preflight Validation');
    console.log('='.repeat(45));

    const _networks = parseNetworks(hre, taskArgs.networks);
    const _manifestPath = taskArgs.manifest.trim();
    const _outputPath = taskArgs.output?.trim() || undefined;

    const _fs = await import('fs');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }

    console.log(`📄 Manifest: ${manifestPath}`);
    console.log(`🌐 Networks: ${networks.join(', ')}`);

    try {
      // Dynamic import to avoid config loading issues
      const { validateManifestPreflight } = await import('../scripts/manifest-preflight');
      const _isValid = await validateManifestPreflight(manifestPath, networks, hre, outputPath);
      if (isValid) {
        console.log('✅ Manifest preflight validation PASSED');
        console.log('🚀 Ready for cross-chain deployment');
        return true;
      }
      console.log('❌ Manifest preflight validation FAILED');
      console.log('🛠️  Review validation report and fix issues before deployment');
      return false;
    } catch (error) {
      console.error('❌ Manifest validation failed:', error);
      throw error;
    }
  });

/* ════════════════════════════════════════════════════════════
   TASK: DEPLOYMENT CLEANUP
   ════════════════════════════════════════════════════════════ */
task('crosschain:cleanup', 'Clean up deployment artifacts')
  .addOptionalParam('networks', 'Comma-separated list of networks to clean', '')
  .addFlag('reports', 'Also clean up reports directory')
  .addFlag('force', 'Force cleanup without confirmation')
  .setAction(async (taskArgs: CleanupArgs) => {
    console.log('🧹 Cross-Chain Deployment Cleanup');
    console.log('='.repeat(40));

    const _fs = await import('fs');
    const _path = await import('path');

    if (!taskArgs.force) {
      console.log('⚠️  This will delete deployment artifacts');
      console.log('Use --force to proceed without confirmation');
      return;
    }

    const networks = (taskArgs.networks || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);

    try {
      if (networks.length > 0) {
        for (const network of networks) {
          const _deploymentDir = path.join(process.cwd(), 'deployments', network);
          if (fs.existsSync(deploymentDir)) {
            fs.rmSync(deploymentDir, { recursive: true, force: true });
            console.log(`✅ Cleaned deployments for ${network}`);
          }
        }
      } else {
        const _deploymentsDir = path.join(process.cwd(), 'deployments');
        if (fs.existsSync(deploymentsDir)) {
          fs.rmSync(deploymentsDir, { recursive: true, force: true });
          console.log('✅ Cleaned all deployment artifacts');
        }
      }

      if (taskArgs.reports) {
        const _reportsDir = path.join(process.cwd(), 'reports');
        if (fs.existsSync(reportsDir)) {
          fs.rmSync(reportsDir, { recursive: true, force: true });
          console.log('✅ Cleaned reports directory');
        }
      }

      console.log('🧹 Cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  });

export {};
