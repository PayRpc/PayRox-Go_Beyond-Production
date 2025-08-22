// tasks/create2-check.ts
import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { runCreate2Check } from "../src/tools/create2Check";

task("create2:check", "Verify CREATE2 determinism + integrity")
  .addParam("factory", "Factory address")
  .addOptionalParam("dispatcher", "Dispatcher address")
  .addParam("salt", "Bytes32 salt")
  .addOptionalParam("expectedaddress", "Expected deployed address")
  .addOptionalParam("expectedfactorycodehash", "Expected factory codehash (bytes32)")
  .addOptionalParam("expecteddispatchercodehash", "Expected dispatcher codehash (bytes32)")
  .addOptionalParam("rpc", "Optional RPC override (otherwise uses current network)")
  .addFlag("nofail", "Do not throw on mismatch")
  // input modes
  .addOptionalParam("artifact", "Artifact path (JSON)")
  .addOptionalParam("contract", "Contract name (from artifacts)")
  .addOptionalParam("argsjson", "Constructor args as JSON array")
  .addOptionalParam("bytecodehex", "Raw creation bytecode hex")
  .addOptionalParam("constructortypes", "Constructor types JSON array")
  .addOptionalParam("constructorargsjson", "Constructor args JSON array")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    const mode =
      args.artifact ? "artifact" :
      args.bytecodehex ? "raw" :
      args.contract ? "contract" : null;

    if (!mode) {
      throw new Error("Provide one of: --artifact | --bytecodehex | --contract");
    }

    console.log("\n🔧 CREATE2 Check Configuration:");
    console.log(`Factory: ${args.factory}`);
    console.log(`Salt: ${args.salt}`);
    console.log(`Mode: ${mode}`);
    console.log(`Network: ${hre.network.name}`);
    
    if (args.dispatcher) console.log(`Dispatcher: ${args.dispatcher}`);
    if (args.expectedaddress) console.log(`Expected Address: ${args.expectedaddress}`);
    if (args.rpc) console.log(`RPC Override: ${args.rpc}`);
    
    const _startTime = Date.now();

    try {
      let result;
      
      if (mode === "artifact") {
        result = await runCreate2Check({
          hre,
          factory: args.factory,
          dispatcher: args.dispatcher,
          salt: args.salt,
          expectedAddress: args.expectedaddress,
          expectedFactoryCodehash: args.expectedfactorycodehash,
          expectedDispatcherCodehash: args.expecteddispatchercodehash,
          rpcUrlOverride: args.rpc,
          noFail: args.nofail,
          mode: "artifact",
          artifactPath: args.artifact,
          argsJson: args.argsjson,
        });
      } else if (mode === "contract") {
        result = await runCreate2Check({
          hre,
          factory: args.factory,
          dispatcher: args.dispatcher,
          salt: args.salt,
          expectedAddress: args.expectedaddress,
          expectedFactoryCodehash: args.expectedfactorycodehash,
          expectedDispatcherCodehash: args.expecteddispatchercodehash,
          rpcUrlOverride: args.rpc,
          noFail: args.nofail,
          mode: "contract",
          contractName: args.contract,
          argsJson: args.argsjson,
        });
      } else {
        result = await runCreate2Check({
          hre,
          factory: args.factory,
          dispatcher: args.dispatcher,
          salt: args.salt,
          expectedAddress: args.expectedaddress,
          expectedFactoryCodehash: args.expectedfactorycodehash,
          expectedDispatcherCodehash: args.expecteddispatchercodehash,
          rpcUrlOverride: args.rpc,
          noFail: args.nofail,
          mode: "raw",
          bytecodeHex: args.bytecodehex,
          constructorTypes: args.constructortypes,
          constructorArgsJson: args.constructorargsjson,
        });
      }

      const _duration = Date.now() - startTime;

      console.log("\n" + "=".repeat(60));
      console.log("📋 CREATE2 Check Results");
      console.log("=".repeat(60));
      console.log(`🎯 Predicted Address: ${result.predicted}`);
      console.log(`🧬 InitCode Hash:     ${result.initCodeHash}`);
      console.log(`📦 Contract Deployed: ${result.deployed ? "✅ YES" : "❌ NO"}`);
      console.log(`⏱️  Check Duration:    ${duration}ms`);
      
      console.log("\n🔍 Verification Results:");
      console.log(`  Predicted vs Expected:  ${result.checks.predictedVsExpected ? "✅" : "❌"}`);
      console.log(`  Factory Codehash:       ${result.checks.factoryCodehash ? "✅" : "❌"}`);
      console.log(`  Dispatcher Codehash:    ${result.checks.dispatcherCodehash ? "✅" : "❌"}`);
      console.log(`  On-chain Prediction:    ${result.checks.onchainPrediction ? "✅" : "❌"}`);
      console.log(`  System Integrity:       ${result.checks.systemIntegrity ? "✅" : "❌"}`);

      const _allPassed = Object.values(result.checks).every(Boolean);
      
      console.log("\n" + "=".repeat(60));
      if (allPassed) {
        console.log("🎉 CREATE2 CHECK PASSED - System is deterministic and secure!");
      } else {
        console.log("❌ CREATE2 CHECK FAILED - Review the errors above");
        if (!args.nofail) {
          process.exit(1);
        }
      }
      console.log("=".repeat(60));

      // Export results for CI/automation
      if (process.env.CI) {
        const summary = {
          success: allPassed,
          predicted: result.predicted,
          deployed: result.deployed,
          checks: result.checks,
          duration,
          timestamp: new Date().toISOString(),
        };
        console.log(`\n::set-output name=create2_result::${JSON.stringify(summary)}`);
      }

    } catch (error: any) {
      console.error("\n❌ CREATE2 Check failed:");
      console.error(error.message);
      
      if (process.env.CI) {
        console.log(`::set-output name=create2_result::${JSON.stringify({ success: false, error: error.message })}`);
      }
      
      if (!args.nofail) {
        process.exit(1);
      }
    }
  });

// Additional utility tasks
task("create2:predict", "Predict CREATE2 address without full verification")
  .addParam("factory", "Factory address")
  .addParam("salt", "Bytes32 salt")
  .addParam("contract", "Contract name")
  .addOptionalParam("argsjson", "Constructor args as JSON array")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    const { runCreate2Check } = await import("../src/tools/create2Check");
    
    const result = await runCreate2Check({
      hre,
      factory: args.factory,
      salt: args.salt,
      mode: "contract",
      contractName: args.contract,
      argsJson: args.argsjson,
      noFail: true, // Just predict, don't verify
    });

    console.log(`🎯 Predicted Address: ${result.predicted}`);
    console.log(`🧬 InitCode Hash: ${result.initCodeHash}`);
  });
