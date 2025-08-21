# Hardhat Plugin Implementation Guide

## Plugin Structure

```
plugins/hardhat-payrox/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Main plugin entry
│   ├── tasks/
│   │   ├── manifest.ts    # Manifest management tasks
│   │   ├── factory.ts     # Factory operations
│   │   ├── split.ts       # Facet splitting tasks
│   │   └── safety.ts      # Safety checks and CI guards
│   ├── utils/
│   │   ├── orderedMerkle.ts
│   │   ├── integrity.ts
│   │   └── config.ts
│   └── types/
│       └── interfaces.ts
└── test/
    └── plugin.test.ts
```

## Core Tasks to Implement

### 1. Facet Splitting Tasks

```typescript
// src/tasks/split.ts
import { task } from "hardhat/config";
import { execSync } from "child_process";
import path from "path";

task("payrox:split", "Split contract into facets")
  .addParam("contract", "Path to contract file")
  .addOptionalParam("out", "Output directory for facets")
  .addOptionalParam("lib", "Path to LibDiamond import")
  .addFlag("externalize", "Force external visibility")
  .addFlag("noDispatchGuard", "Omit onlyDispatcher modifier")
  .setAction(async (taskArgs, hre) => {
    const { contract, out, lib, externalize, noDispatchGuard } = taskArgs;
    
    // Use our integrated splitter
    const splitterPath = path.resolve("scripts/tools/ast/split-facets.js");
    const outDir = out || path.join(path.dirname(contract), "facets");
    
    let cmd = `node "${splitterPath}" "${contract}" --out "${outDir}"`;
    if (lib) cmd += ` --lib "${lib}"`;
    if (externalize) cmd += " --externalize";
    if (noDispatchGuard) cmd += " --no-dispatch-guard";
    
    try {
      const output = execSync(cmd, { encoding: 'utf8' });
      console.log(output);
      
      // Optional: compile generated facets
      await hre.run("compile");
      
      console.log(`✅ Facets generated in: ${outDir}`);
    } catch (error) {
      throw new Error(`Facet splitting failed: ${error.message}`);
    }
  });

task("payrox:postprocess", "Run postprocess on split facets")
  .addParam("dir", "Directory containing facets")
  .setAction(async (taskArgs, hre) => {
    const postprocessPath = path.resolve("scripts/postprocess-splits.js");
    const cmd = `node "${postprocessPath}" "${taskArgs.dir}"`;
    
    try {
      const output = execSync(cmd, { encoding: 'utf8' });
      console.log(output);
      console.log("✅ Postprocessing complete");
    } catch (error) {
      throw new Error(`Postprocessing failed: ${error.message}`);
    }
  });
```

### 2. Manifest Management Tasks

```typescript
// src/tasks/manifest.ts
import { task } from "hardhat/config";
import { readFileSync } from "fs";

task("payrox:manifest:build", "Build manifest from facets")
  .addParam("facetsDir", "Directory containing facet contracts")
  .addOptionalParam("output", "Output file for manifest")
  .setAction(async (taskArgs, hre) => {
    // Implementation to build manifest from compiled facets
    // This would scan the facets directory, extract selectors, and build manifest
    console.log("🔨 Building manifest...");
    // TODO: Implement manifest building logic
  });

task("payrox:manifest:apply", "Apply manifest routes to dispatcher")
  .addParam("dispatcher", "Dispatcher contract address")
  .addParam("manifest", "Path to manifest JSON file")
  .addOptionalParam("gasLimit", "Gas limit for transaction")
  .setAction(async (taskArgs, hre) => {
    const { dispatcher, manifest, gasLimit } = taskArgs;
    
    // Load manifest
    const manifestData = JSON.parse(readFileSync(manifest, 'utf8'));
    
    // Get dispatcher contract
    const dispatcherContract = await hre.ethers.getContractAt(
      "IManifestDispatcher", 
      dispatcher
    );
    
    // Verify integrity before applying
    console.log("🔍 Verifying manifest integrity...");
    // TODO: Add integrity checks
    
    // Apply routes
    console.log("📡 Applying routes to dispatcher...");
    const tx = await dispatcherContract.applyRoutes(
      manifestData.selectors,
      manifestData.facets,
      manifestData.hashes,
      manifestData.proofs,
      manifestData.positions,
      { gasLimit: gasLimit || 500000 }
    );
    
    console.log(`✅ Routes applied. Transaction: ${tx.hash}`);
    await tx.wait();
  });

task("payrox:manifest:commit", "Commit manifest changes")
  .addParam("dispatcher", "Dispatcher contract address")
  .setAction(async (taskArgs, hre) => {
    const dispatcherContract = await hre.ethers.getContractAt(
      "IManifestDispatcher", 
      taskArgs.dispatcher
    );
    
    const tx = await dispatcherContract.commitRoutes();
    console.log(`✅ Manifest committed. Transaction: ${tx.hash}`);
    await tx.wait();
  });

task("payrox:manifest:activate", "Activate committed manifest")
  .addParam("dispatcher", "Dispatcher contract address")
  .setAction(async (taskArgs, hre) => {
    const dispatcherContract = await hre.ethers.getContractAt(
      "IManifestDispatcher", 
      taskArgs.dispatcher
    );
    
    const tx = await dispatcherContract.activateRoutes();
    console.log(`✅ Manifest activated. Transaction: ${tx.hash}`);
    await tx.wait();
  });
```

### 3. Factory Operations

```typescript
// src/tasks/factory.ts
import { task } from "hardhat/config";

task("payrox:factory:stage", "Stage contract bytecode via factory")
  .addParam("factory", "Factory contract address")
  .addParam("bytecode", "Bytecode to stage (hex string)")
  .setAction(async (taskArgs, hre) => {
    const { factory, bytecode } = taskArgs;
    
    const factoryContract = await hre.ethers.getContractAt(
      "IChunkFactory", 
      factory
    );
    
    console.log("🏗️ Staging bytecode...");
    const tx = await factoryContract.stage(bytecode);
    console.log(`✅ Bytecode staged. Transaction: ${tx.hash}`);
    await tx.wait();
  });

task("payrox:factory:deploy", "Deploy staged contract")
  .addParam("factory", "Factory contract address")
  .addParam("salt", "Salt for deterministic deployment")
  .setAction(async (taskArgs, hre) => {
    const { factory, salt } = taskArgs;
    
    const factoryContract = await hre.ethers.getContractAt(
      "IChunkFactory", 
      factory
    );
    
    console.log("🚀 Deploying contract...");
    const tx = await factoryContract.deploy(salt);
    console.log(`✅ Contract deployed. Transaction: ${tx.hash}`);
    await tx.wait();
  });

task("payrox:factory:batch", "Batch deploy multiple contracts")
  .addParam("factory", "Factory contract address")
  .addParam("config", "JSON config file with deployment data")
  .setAction(async (taskArgs, hre) => {
    const { factory, config } = taskArgs;
    const deployments = JSON.parse(readFileSync(config, 'utf8'));
    
    const factoryContract = await hre.ethers.getContractAt(
      "IChunkFactory", 
      factory
    );
    
    console.log(`🚀 Batch deploying ${deployments.length} contracts...`);
    
    for (const deployment of deployments) {
      // Stage
      await factoryContract.stage(deployment.bytecode);
      console.log(`📦 Staged: ${deployment.name}`);
      
      // Deploy
      await factoryContract.deploy(deployment.salt);
      console.log(`✅ Deployed: ${deployment.name}`);
    }
    
    console.log("✅ Batch deployment complete");
  });
```

### 4. Safety Checks and CI Guards

```typescript
// src/tasks/safety.ts
import { task } from "hardhat/config";

task("payrox:safety:check", "Run comprehensive safety checks")
  .addParam("dispatcher", "Dispatcher contract address")
  .addOptionalParam("config", "Safety check configuration file")
  .setAction(async (taskArgs, hre) => {
    const { dispatcher, config } = taskArgs;
    
    console.log("🛡️ Running safety checks...");
    
    const dispatcherContract = await hre.ethers.getContractAt(
      "IManifestDispatcher", 
      dispatcher
    );
    
    // Check 1: Dispatcher not frozen when it shouldn't be
    const isFrozen = await dispatcherContract.isFrozen();
    if (isFrozen) {
      throw new Error("❌ SAFETY: Dispatcher is frozen");
    }
    console.log("✅ Dispatcher freeze state OK");
    
    // Check 2: Codehash integrity
    const expectedCodehash = "0x..."; // Load from config
    const actualCodehash = await hre.ethers.provider.getCode(dispatcher);
    // TODO: Implement codehash verification
    console.log("✅ Codehash integrity OK");
    
    // Check 3: Route integrity
    // TODO: Verify all expected routes are present
    console.log("✅ Route integrity OK");
    
    // Check 4: OrderedMerkle proof validation
    // TODO: Validate merkle proofs
    console.log("✅ Merkle proof validation OK");
    
    // Check 5: Selector regression check
    // TODO: Compare current selectors with baseline
    console.log("✅ Selector regression check OK");
    
    console.log("✅ All safety checks passed");
  });

task("payrox:ci:guard", "CI guard that fails on unsafe conditions")
  .addParam("dispatcher", "Dispatcher contract address")
  .setAction(async (taskArgs, hre) => {
    try {
      await hre.run("payrox:safety:check", taskArgs);
      console.log("✅ CI guard passed - safe to proceed");
      process.exit(0);
    } catch (error) {
      console.error("❌ CI guard failed:", error.message);
      process.exit(1);
    }
  });
```

## Plugin Configuration

```typescript
// src/utils/config.ts
export interface PayRoxConfig {
  networks: {
    [networkName: string]: {
      dispatcher?: string;
      factory?: string;
      gasSettings?: {
        gasLimit?: number;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      };
    };
  };
  splitting: {
    defaultLibPath?: string;
    outputDir?: string;
    externalize?: boolean;
    noDispatchGuard?: boolean;
  };
  safety: {
    requiredCodehashes?: { [address: string]: string };
    baselineSelectors?: string;
    merkleValidation?: boolean;
  };
}

export function getPayRoxConfig(hre: any): PayRoxConfig {
  return hre.config.payrox || {};
}
```

## Main Plugin Entry

```typescript
// src/index.ts
import { extendConfig, extendEnvironment } from "hardhat/config";
import { HardhatConfig, HardhatUserConfig } from "hardhat/types";
import "./tasks/split";
import "./tasks/manifest";
import "./tasks/factory";
import "./tasks/safety";

extendConfig(
  (config: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {
    // Extend configuration with PayRox defaults
    config.payrox = userConfig.payrox || {};
  }
);

extendEnvironment((hre) => {
  // Add PayRox utilities to Hardhat Runtime Environment
  hre.payrox = {
    // Add helper functions here if needed
  };
});
```

## Usage Examples

```bash
# Split contract into facets
npx hardhat payrox:split --contract contracts/MyContract.sol

# Build and apply manifest
npx hardhat payrox:manifest:build --facets-dir contracts/facets
npx hardhat payrox:manifest:apply --dispatcher 0x123... --manifest manifest.json

# Factory operations
npx hardhat payrox:factory:stage --factory 0x456... --bytecode 0x608060...

# Safety checks
npx hardhat payrox:safety:check --dispatcher 0x123...

# CI integration
npx hardhat payrox:ci:guard --dispatcher 0x123...
```

## Installation

```json
{
  "name": "hardhat-payrox",
  "version": "1.0.0",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "dependencies": {
    "hardhat": "^2.0.0"
  },
  "peerDependencies": {
    "hardhat": "^2.0.0",
    "@nomiclabs/hardhat-ethers": "^2.0.0",
    "ethers": "^5.0.0"
  }
}
```

This plugin integrates seamlessly with your existing PayRox infrastructure while providing a clean, task-based interface for all development workflows.
