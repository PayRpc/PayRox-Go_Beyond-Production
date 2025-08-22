#!/usr/bin/env ts-node

/**
 * Deploy Facets Script
 * Uses the generated deployment plan and codehash predictions to deploy actual contracts
 */

import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import hre from "hardhat";

interface DeploymentPlan {
  planId: string;
  selectors: string[];
  facets: string[];
  codehashes: string[];
  root: string;
  eta: number;
  chainId: number;
  epoch: number;
  mode: "predictive" | "observed";
  timestamp: string;
}

interface FacetCodehash {
  name: string;
  codehash: string;
  buildHash: string;
}

async function main() {
  console.log("🚀 Deploying PayRox Facets with Predicted Codehashes");
  console.log("====================================================");

  // Load deployment plan
  const planPath = path.join("split-output", "deployment-plan.json");
  if (!fs.existsSync(planPath)) {
    throw new Error("Deployment plan not found. Run buildMerkle.ts first.");
  }

  const deploymentPlan: DeploymentPlan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  console.log(`📋 Using deployment plan: ${deploymentPlan.planId}`);
  console.log(`   • Total selectors: ${deploymentPlan.selectors.length}`);
  console.log(`   • Merkle root: ${deploymentPlan.root}`);
  console.log(`   • Mode: ${deploymentPlan.mode}`);

  // Load predicted codehashes
  const codehashFiles = fs.readdirSync("split-output")
    .filter(f => f.startsWith("codehashes-predictive-"))
    .sort()
    .reverse(); // Get the latest

  if (codehashFiles.length === 0) {
    throw new Error("No codehash predictions found. Run buildMerkle.ts first.");
  }

  const codehashPath = path.join("split-output", codehashFiles[0]!);
  const codehashData = JSON.parse(fs.readFileSync(codehashPath, "utf8"));
  const predictedCodehashes: FacetCodehash[] = codehashData.codehashes;

  console.log(`🔐 Using codehash predictions: ${codehashFiles[0]}`);
  console.log(`   • Build hash: ${codehashData.buildHash}`);
  console.log(`   • Predicted facets: ${predictedCodehashes.length}`);

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account available");
  }

  console.log(`\n👤 Deploying with account: ${deployer.address}`);
  console.log(`   • Balance: ${ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);

  // Deploy each facet and verify codehashes
  const deployedFacets: Array<{
    name: string;
    address: string;
    predictedCodehash: string;
    actualCodehash: string;
    matches: boolean;
    gasUsed: bigint;
  }> = [];

  console.log("\n🏗️  Deploying Facets");
  console.log("===================");

  for (const prediction of predictedCodehashes) {
    try {
      console.log(`\n📦 Deploying ${prediction.name}...`);

      // Prefer generated facets under contracts/facets-fixed using fully-qualified names
      const fqName = `contracts/facets-fixed/${prediction.name}.sol:${prediction.name}`;
      let contractFactory;
      try {
        contractFactory = await hre.ethers.getContractFactory(fqName);
      } catch (e) {
        // Fallback to unqualified if only one artifact exists
        contractFactory = await hre.ethers.getContractFactory(prediction.name);
      }

      // Generated stubs have no constructor args; deploy with zero args
      const contract = await contractFactory.deploy();

      await contract.waitForDeployment();

      const address = await contract.getAddress();
      const receipt = await hre.ethers.provider.getTransactionReceipt(contract.deploymentTransaction()!.hash);
      const gasUsed = receipt!.gasUsed;

      // Get the actual deployed bytecode
      const deployedBytecode = await hre.ethers.provider.getCode(address);
      const actualCodehash = ethers.keccak256(deployedBytecode);

      const matches = actualCodehash === prediction.codehash;

      console.log(`   ✅ Deployed to: ${address}`);
      console.log(`   ⛽ Gas used: ${gasUsed.toLocaleString()}`);
      console.log(`   🔐 Predicted: ${prediction.codehash}`);
      console.log(`   🔐 Actual:    ${actualCodehash}`);
      console.log(`   ${matches ? '✅ MATCH' : '❌ MISMATCH'}`);

      deployedFacets.push({
        name: prediction.name,
        address,
        predictedCodehash: prediction.codehash,
        actualCodehash,
        matches,
        gasUsed
      });

    } catch (error) {
      console.error(`   ❌ Failed to deploy ${prediction.name}:`, error);
    }
  }

  // Summary
  console.log("\n📊 DEPLOYMENT SUMMARY");
  console.log("====================");

  const successful = deployedFacets.length;
  const matches = deployedFacets.filter(f => f.matches).length;
  const totalGas = deployedFacets.reduce((sum, f) => sum + f.gasUsed, 0n);

  console.log(`✅ Successfully deployed: ${successful}/${predictedCodehashes.length} facets`);
  console.log(`🎯 Codehash matches: ${matches}/${successful} (${((matches/successful)*100).toFixed(1)}%)`);
  console.log(`⛽ Total gas used: ${totalGas.toLocaleString()}`);

  // Export deployment results
  const deploymentResults = {
    timestamp: new Date().toISOString(),
    planId: deploymentPlan.planId,
    buildHash: codehashData.buildHash,
    deployer: deployer.address,
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId,
    deployedFacets,
    summary: {
      totalDeployed: successful,
      totalPredicted: predictedCodehashes.length,
      codehashMatches: matches,
      matchRate: matches / successful,
      totalGasUsed: totalGas.toString()
    }
  };

  const resultsPath = path.join("split-output", "deployment-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(deploymentResults, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2));
  console.log(`\n💾 Deployment results saved: ${resultsPath}`);

  // List all deployed addresses for potential observed mode
  if (deployedFacets.length > 0) {
    console.log("\n📋 Deployed Facet Addresses (for observed mode):");
    console.log("================================================");
    const facetAddresses: Record<string, string> = {};

    for (const facet of deployedFacets) {
      facetAddresses[facet.name] = facet.address;
      console.log(`${facet.name}: ${facet.address}`);
    }

    const addressesPath = path.join("split-output", "deployed-addresses.json");
    fs.writeFileSync(addressesPath, JSON.stringify(facetAddresses, null, 2));
    console.log(`\n💾 Addresses saved: ${addressesPath}`);

    console.log("\n🔄 To run observed mode validation:");
    console.log(`npx ts-node tools/splitter/scripts/buildMerkle.ts observed`);
  }

  if (matches === successful && successful > 0) {
    console.log("\n🎉 ALL CODEHASH PREDICTIONS VERIFIED!");
    console.log("The deterministic build system is working perfectly.");
  } else if (matches < successful) {
    console.log("\n⚠️  Some codehash mismatches detected.");
    console.log("This might indicate non-deterministic builds or environment differences.");
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Deployment failed:", error);
      process.exit(1);
    });
}
