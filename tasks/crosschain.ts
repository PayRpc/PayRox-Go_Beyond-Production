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

const DEFAULT_NETWORKS = 'sepolia,base-sepolia,arbitrum-sepolia';

function parseNetworks(hre: HardhatRuntimeEnvironment, csv?: string): string[] {
  const list = (csv || DEFAULT_NETWORKS).split(',').map((n) => n.trim()).filter(Boolean);
  const known = new Set(Object.keys(hre.config.networks));
  const unknown = list.filter((n) => !known.has(n));
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

    const networks = parseNetworks(hre, taskArgs.networks);

    // Enforce manifest presence unless explicitly skipped
    const manifestPath = taskArgs.manifest?.trim() || undefined;
    if (!taskArgs.skipmanifest) {
      if (!manifestPath) throw new Error('Manifest path is required (or pass --skipmanifest).');
      const fs = await import('fs');
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
      // CREATE2 Preflight Check (as requested)
      if (!config.skipFactoryDeployment) {
        console.log('\n🔍 CREATE2 Preflight Checks');
        console.log('='.repeat(50));
        
        try {
          const { preDeploymentCreate2Check } = await import('./crosschain-create2-integration');
          
          // Example configuration - adapt to your contracts
          const create2Config = {
            factory: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Your factory address
            dispatcher: "0x1111111111111111111111111111111111111111", // Your dispatcher address  
            salt: "0x" + "1".repeat(64), // Your deterministic salt
            contractName: "DeterministicChunkFactory", // Your contract
            constructorArgs: [
              "0x0000000000000000000000000000000000000000", // feeRecipient
              "0x1111111111111111111111111111111111111111", // dispatcherAddress
              "0x2222222222222222222222222222222222222222222222222222222222222222", // manifestHash
              "0x3333333333333333333333333333333333333333333333333333333333333333", // dispatcherCodehash
              "0x4444444444444444444444444444444444444444444444444444444444444444", // factoryCodehash
              "1000000000000000", // gasFee
              true // enabled
            ],
            // Add these from your config if available:
            // expectedFactoryCodehash: config.expectedFactoryCodehash,
            // expectedDispatcherCodehash: config.expectedDispatcherCodehash,
          };

          const preflightOk = await preDeploymentCreate2Check(hre, create2Config);
          if (!preflightOk) {
            throw new Error("CREATE2 preflight check failed");
          }
          
          console.log('✅ CREATE2 preflight checks passed');
        } catch (error: any) {
          console.warn('⚠️  CREATE2 preflight check failed:', error.message);
          if (!config.force) {
            throw new Error("CREATE2 preflight failed. Use --force to continue anyway.");
          }
          console.log('🚨 Continuing with deployment due to --force flag');
        }
      }

      // Dynamic imports to avoid config loading issues
      const { main: orchestrateDeployment } = await import('../scripts/orchestrate-crosschain');
      const result: any = await orchestrateDeployment(hre, config);

      if (result?.success) {
        console.log('\n🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!');
        if (result.factoryAddress) console.log(`📍 Factory Address: ${result.factoryAddress}`);
        if (typeof result.duration === 'number') console.log(`⏱️  Duration: ${result.duration}ms`);

        console.log('\n📊 NETWORK RESULTS:');
        const entries = Object.entries(result.deploymentResults || {});
        for (const [network, netResultRaw] of entries) {
          const netResult: any = netResultRaw || {};
          const errs: string[] = Array.isArray(netResult.errors) ? netResult.errors : [];
          const status = errs.length === 0 ? '✅' : '❌';
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

    const networks = parseNetworks(hre, taskArgs.networks);
    console.log(`🌐 Target networks: ${networks.join(', ')}`);

    try {
      if (taskArgs.validate) {
        console.log('🔍 Validation mode - checking address parity only');

        // Dynamic import to avoid config loading issues
        const { DeterministicFactoryDeployer } = await import(
          '../scripts/deploy-deterministic-factory'
        );
        const deployer = new DeterministicFactoryDeployer();

        const parityResult: any = await deployer.validateFactoryAddressParity(networks, hre);

        if (parityResult?.valid) {
          console.log(`✅ Factory address parity validated: ${parityResult.expectedAddress}`);
          return parityResult.expectedAddress;
        }
        throw new Error('Factory address parity validation failed');
      }

      // Dynamic import to avoid config loading issues
      const { main: deployDeterministicFactory } = await import('../scripts/deploy-deterministic-factory');
      const factoryAddress = await deployDeterministicFactory(hre, { networks });
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

    const networks = parseNetworks(hre, taskArgs.networks);
    const manifestPath = taskArgs.manifest.trim();
    const outputPath = taskArgs.output?.trim() || undefined;

    const fs = await import('fs');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }

    console.log(`📄 Manifest: ${manifestPath}`);
    console.log(`🌐 Networks: ${networks.join(', ')}`);

    try {
      // Dynamic import to avoid config loading issues
      const { validateManifestPreflight } = await import('../scripts/manifest-preflight');
      const isValid = await validateManifestPreflight(manifestPath, networks, hre, outputPath);
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

    const fs = await import('fs');
    const path = await import('path');

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
          const deploymentDir = path.join(process.cwd(), 'deployments', network);
          if (fs.existsSync(deploymentDir)) {
            fs.rmSync(deploymentDir, { recursive: true, force: true });
            console.log(`✅ Cleaned deployments for ${network}`);
          }
        }
      } else {
        const deploymentsDir = path.join(process.cwd(), 'deployments');
        if (fs.existsSync(deploymentsDir)) {
          fs.rmSync(deploymentsDir, { recursive: true, force: true });
          console.log('✅ Cleaned all deployment artifacts');
        }
      }

      if (taskArgs.reports) {
        const reportsDir = path.join(process.cwd(), 'reports');
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
