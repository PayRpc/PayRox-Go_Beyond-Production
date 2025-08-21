// scripts/test-create2-check.ts
/**
 * Test script for CREATE2 checking functionality
 * Run with: npx hardhat run scripts/test-create2-check.ts
 */

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { runCreate2Check, preflightCreate2Check } from "../src/tools/create2Check";

async function main() {
  const hre = require("hardhat") as HardhatRuntimeEnvironment;
  
  console.log("🧪 Testing CREATE2 Check Implementation");
  console.log("=".repeat(60));
  
  // Test configuration
  const testConfig = {
    factory: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Local hardhat factory
    salt: "0x" + "1".repeat(64), // Test salt
    contractName: "DeterministicChunkFactory", // Use an existing contract
    constructorArgs: [
      "0x" + "0".repeat(40), // feeRecipient
      "0x" + "1".repeat(40), // dispatcher
      "0x" + "2".repeat(64), // manifestHash
      "0x" + "3".repeat(64), // dispatcherCodehash
      "0x" + "4".repeat(64), // factoryCodehash
      "1000000000000000",    // gasFee
      true                   // enabled
    ],
  };

  console.log("\n📋 Test Configuration:");
  console.log(`Network: ${hre.network.name}`);
  console.log(`Factory: ${testConfig.factory}`);
  console.log(`Salt: ${testConfig.salt}`);
  console.log(`Contract: ${testConfig.contractName}`);

  try {
    console.log("\n🔬 Test 1: Basic CREATE2 Prediction");
    console.log("-".repeat(40));
    
    const result1 = await runCreate2Check({
      hre,
      factory: testConfig.factory,
      salt: testConfig.salt,
      mode: "contract",
      contractName: testConfig.contractName,
      argsJson: JSON.stringify(testConfig.constructorArgs),
      noFail: true, // Don't fail on missing factory
    });

    console.log(`✅ Predicted address: ${result1.predicted}`);
    console.log(`✅ InitCode hash: ${result1.initCodeHash}`);
    console.log(`✅ Contract deployed: ${result1.deployed ? "YES" : "NO"}`);

    console.log("\n🔬 Test 2: Preflight Check (simulated)");
    console.log("-".repeat(40));

    const result2 = await preflightCreate2Check(hre, {
      factory: testConfig.factory,
      salt: testConfig.salt,
      contractName: testConfig.contractName,
      constructorArgs: testConfig.constructorArgs,
      throwOnFail: false,
    });

    console.log("✅ Preflight check completed");

    console.log("\n🔬 Test 3: Address Consistency");
    console.log("-".repeat(40));

    // Test with same parameters should produce same result
    const result3 = await runCreate2Check({
      hre,
      factory: testConfig.factory,
      salt: testConfig.salt,
      mode: "contract",
      contractName: testConfig.contractName,
      argsJson: JSON.stringify(testConfig.constructorArgs),
      noFail: true,
    });

    const consistent = result1.predicted === result3.predicted && 
                      result1.initCodeHash === result3.initCodeHash;

    if (consistent) {
      console.log("✅ Address prediction is consistent");
    } else {
      console.log("❌ Address prediction inconsistent!");
      console.log(`  First:  ${result1.predicted}`);
      console.log(`  Second: ${result3.predicted}`);
    }

    console.log("\n🔬 Test 4: Different Salt = Different Address");
    console.log("-".repeat(40));

    const differentSalt = "0x" + "2".repeat(64);
    const result4 = await runCreate2Check({
      hre,
      factory: testConfig.factory,
      salt: differentSalt,
      mode: "contract",
      contractName: testConfig.contractName,
      argsJson: JSON.stringify(testConfig.constructorArgs),
      noFail: true,
    });

    const differentAddress = result1.predicted !== result4.predicted;
    if (differentAddress) {
      console.log("✅ Different salt produces different address");
      console.log(`  Original: ${result1.predicted}`);
      console.log(`  New:      ${result4.predicted}`);
    } else {
      console.log("❌ Same address with different salt - this is wrong!");
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 CREATE2 Check Implementation Tests Complete!");
    console.log("=".repeat(60));

    // Export test results
    const testResults = {
      network: hre.network.name,
      timestamp: new Date().toISOString(),
      tests: {
        basicPrediction: !!result1.predicted,
        preflightCheck: !!result2.predicted,
        consistency: consistent,
        saltDifference: differentAddress,
      },
      predictions: {
        original: result1.predicted,
        originalHash: result1.initCodeHash,
        differentSalt: result4.predicted,
        differentSaltHash: result4.initCodeHash,
      }
    };

    console.log("\n📄 Test Results JSON:");
    console.log(JSON.stringify(testResults, null, 2));

  } catch (error: any) {
    console.error("\n❌ Test failed:");
    console.error(error.message);
    process.exit(1);
  }
}

// Execute tests
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main as testCreate2Check };
