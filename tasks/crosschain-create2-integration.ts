// tasks/crosschain-create2-integration.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { preflightCreate2Check } from "../src/tools/create2Check";

/**
 * Cross-chain CREATE2 integration utilities
 * Add these to your existing crosschain tasks
 */

export interface CrossChainCreate2Config {
  factory: string;
  dispatcher?: string;
  salt: string;
  contractName: string;
  constructorArgs: any[];
  expectedAddress?: string;
  expectedFactoryCodehash?: string;
  expectedDispatcherCodehash?: string;
  skipCheck?: boolean;
}

/**
 * Pre-deployment CREATE2 verification
 * Call this before any cross-chain deployment
 */
export async function preDeploymentCreate2Check(
  hre: HardhatRuntimeEnvironment,
  config: CrossChainCreate2Config
): Promise<boolean> {
  if (config.skipCheck) {
    console.log("⏭️  Skipping CREATE2 preflight check (skipCheck=true)");
    return true;
  }

  console.log("\n🛫 Pre-deployment CREATE2 verification");
  console.log(`Network: ${hre.network.name}`);
  console.log(`Contract: ${config.contractName}`);
  console.log(`Factory: ${config.factory}`);

  try {
    const result = await preflightCreate2Check(hre, {
      ...config,
      throwOnFail: true,
    });

    if (result.deployed) {
      console.log(`⚠️  Contract already deployed at ${result.predicted}`);
      console.log("   This may be expected for upgrades or re-runs");
    }

    return true;
  } catch (error: any) {
    console.error("❌ Pre-deployment CREATE2 check failed:");
    console.error(error.message);
    return false;
  }
}

/**
 * Post-deployment verification
 * Call this after deployment to verify the address matches prediction
 */
export async function postDeploymentCreate2Verify(
  hre: HardhatRuntimeEnvironment,
  config: CrossChainCreate2Config,
  actualDeployedAddress: string
): Promise<boolean> {
  console.log("\n🔍 Post-deployment CREATE2 verification");
  
  try {
    const result = await preflightCreate2Check(hre, {
      ...config,
      expectedAddress: actualDeployedAddress,
      throwOnFail: false,
    });

    if (result.predicted.toLowerCase() === actualDeployedAddress.toLowerCase()) {
      console.log("✅ Deployed address matches CREATE2 prediction!");
      return true;
    } else {
      console.error(`❌ Address mismatch: predicted=${result.predicted} actual=${actualDeployedAddress}`);
      return false;
    }
  } catch (error: any) {
    console.error("❌ Post-deployment verification failed:");
    console.error(error.message);
    return false;
  }
}

/**
 * Cross-chain consistency check
 * Verify the same contract would deploy to the same address across networks
 */
export async function crossChainConsistencyCheck(
  configs: Array<{
    hre: HardhatRuntimeEnvironment;
    config: CrossChainCreate2Config;
    networkName: string;
  }>
): Promise<boolean> {
  console.log("\n🌐 Cross-chain CREATE2 consistency check");
  console.log(`Checking ${configs.length} networks...`);

  const predictions: Array<{ network: string; predicted: string; initCodeHash: string }> = [];

  for (const { hre, config, networkName } of configs) {
    try {
      const result = await preflightCreate2Check(hre, {
        ...config,
        throwOnFail: false,
      });

      predictions.push({
        network: networkName,
        predicted: result.predicted,
        initCodeHash: result.initCodeHash,
      });

      console.log(`  ${networkName}: ${result.predicted}`);
    } catch (error: any) {
      console.error(`❌ Failed to check ${networkName}: ${error.message}`);
      return false;
    }
  }

  // Check consistency
  const firstPrediction = predictions[0];
  if (!firstPrediction) {
    console.error("❌ No predictions available");
    return false;
  }
  
  const allMatch = predictions.every(
    p => p.predicted.toLowerCase() === firstPrediction.predicted.toLowerCase() &&
         p.initCodeHash === firstPrediction.initCodeHash
  );

  if (allMatch) {
    console.log("✅ All networks predict the same CREATE2 address!");
    console.log(`   Address: ${firstPrediction.predicted}`);
    console.log(`   InitCode Hash: ${firstPrediction.initCodeHash}`);
    return true;
  } else {
    console.error("❌ CREATE2 predictions differ across networks!");
    predictions.forEach(p => {
      console.error(`   ${p.network}: ${p.predicted} (${p.initCodeHash})`);
    });
    return false;
  }
}

/**
 * Example integration with existing crosschain task
 * Add this to your crosschain.ts task
 */
export function integrateWithCrossChainTask() {
  return `
// Add this to your existing tasks/crosschain.ts

import { 
  preDeploymentCreate2Check, 
  postDeploymentCreate2Verify,
  crossChainConsistencyCheck 
} from './crosschain-create2-integration';

// Inside your crosschain task setAction, BEFORE orchestrateDeployment():

if (!config.skipFactoryDeployment) {
  console.log('\\n🔍 CREATE2 Preflight Checks');
  
  // Example configuration - adapt to your contracts
  const create2Config = {
    factory: config.factoryAddress || "0x...", // Your factory address
    dispatcher: config.dispatcherAddress,
    salt: "0x" + "1".repeat(64), // Your deterministic salt
    contractName: "DeterministicChunkFactory", // Your contract
    constructorArgs: [
      config.feeRecipient,
      config.dispatcherAddress,
      config.manifestHash,
      config.dispatcherCodehash,
      config.factoryCodehash,
      config.gasFee,
      config.enabled
    ],
    expectedFactoryCodehash: config.expectedFactoryCodehash,
    expectedDispatcherCodehash: config.expectedDispatcherCodehash,
  };

  const preflightOk = await preDeploymentCreate2Check(hre, create2Config);
  if (!preflightOk) {
    throw new Error("CREATE2 preflight check failed");
  }

  // ... your existing deployment logic ...
  
  // AFTER deployment:
  const deployedAddress = await orchestrateDeployment(config);
  
  const postVerifyOk = await postDeploymentCreate2Verify(
    hre, 
    create2Config, 
    deployedAddress
  );
  
  if (!postVerifyOk) {
    console.warn("⚠️  Post-deployment verification failed - check deployment");
  }
}
`;
}
