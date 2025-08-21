// SPDX-License-Identifier: MIT
/**
 * Gas Fixture for applyRoutes Operation
 * 
 * Measures gas consumption for the applyRoutes function with various scenarios
 * to establish baseline gas costs for optimization and monitoring.
 */

const { ethers } = require('hardhat');
import * as fs from 'fs';
import * as path from 'path';

interface GasEstimate {
  ts: number;
  network: string;
  deployer: string;
  dispatcher: string;
  facet: string;
  root: string;
  epoch: string;
  activationDelaySeconds: number;
  estimates: {
    applyRoutes: string | null;
    activateCommittedRoot: string | null;
  };
}

interface RouteData {
  selector: string;
  facet: string;
  codehash?: string;
}

async function main() {
  console.log('🔥 Gas Fixture: applyRoutes Operation');
  
  const [deployer] = await ethers.getSigners();
  console.log(`📋 Deployer: ${deployer.address}`);
  
  // Deploy test contracts
  console.log('\n📦 Deploying test contracts...');
  
  // Deploy MockManifestDispatcher
  const MockManifestDispatcher = await ethers.getContractFactory('MockManifestDispatcher');
  const dispatcher = await MockManifestDispatcher.deploy();
  await dispatcher.waitForDeployment();
  const dispatcherAddress = await dispatcher.getAddress();
  console.log(`✅ MockManifestDispatcher: ${dispatcherAddress}`);
  
  // Deploy a sample facet for testing
  const SampleFacet = await ethers.getContractFactory('SampleFacet');
  const sampleFacet = await SampleFacet.deploy();
  await sampleFacet.waitForDeployment();
  const facetAddress = await sampleFacet.getAddress();
  console.log(`✅ SampleFacet: ${facetAddress}`);
  
  // Prepare route data
  const routes: RouteData[] = [
    {
      selector: '0x20965255', // setValue function
      facet: facetAddress
    },
    {
      selector: '0x55241077', // getValue function  
      facet: facetAddress
    }
  ];
  
  console.log(`\n📊 Testing with ${routes.length} routes`);
  
  // Calculate merkle root from routes
  const routeHashes = routes.map(route => 
    ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes4', 'address'], 
      [route.selector, route.facet]
    ))
  );
  
  // Simple merkle root calculation for test
  const root = ethers.keccak256(ethers.concat(routeHashes));
  console.log(`🌳 Merkle Root: ${root}`);
  
  // Get current epoch
  const currentEpoch = await dispatcher.currentEpoch();
  // currentEpoch may be a BigNumber-like object; coerce to string and use BigInt to increment
  const nextEpoch = BigInt(currentEpoch.toString()) + BigInt(1);
  
  console.log(`📅 Current Epoch: ${currentEpoch}`);
  console.log(`📅 Target Epoch: ${nextEpoch}`);
  
  // Test scenarios
  const scenarios = [
    {
      name: 'Immediate Activation',
      activationDelaySeconds: 0
    },
    {
      name: 'Standard Delay (1 hour)',
      activationDelaySeconds: 3600
    }
  ];
  
  for (const scenario of scenarios) {
    console.log(`\n🧪 Testing Scenario: ${scenario.name}`);
    
    const gasEstimate: GasEstimate = {
      ts: Date.now(),
      network: 'hardhat',
      deployer: deployer.address,
      dispatcher: dispatcherAddress,
      facet: facetAddress,
      root: root,
      epoch: nextEpoch.toString(),
      activationDelaySeconds: scenario.activationDelaySeconds,
      estimates: {
        applyRoutes: null,
        activateCommittedRoot: null
      }
    };
    
    try {
      // Estimate gas for applyRoutes
      console.log('📏 Estimating gas for applyRoutes...');
      const applyRoutesGas = await dispatcher.applyRoutes.estimateGas(
        routes.map(r => r.selector),
        nextEpoch
      );
      gasEstimate.estimates.applyRoutes = applyRoutesGas.toString();
      console.log(`   Gas estimate: ${applyRoutesGas.toLocaleString()}`);
      
      // Execute applyRoutes
      const applyTx = await dispatcher.applyRoutes(
        routes.map(r => r.selector),
        nextEpoch
      );
      await applyTx.wait();
      console.log('✅ applyRoutes executed');
      
      // Test activation only if immediate
      if (scenario.activationDelaySeconds === 0) {
        console.log('📏 Estimating gas for activateCommittedRoot...');
        const activateGas = await dispatcher.activateCommittedRoot.estimateGas();
        gasEstimate.estimates.activateCommittedRoot = activateGas.toString();
        console.log(`   Gas estimate: ${activateGas.toLocaleString()}`);
      } else {
        console.log('⏰ Skipping activation due to time delay');
      }
      
    } catch (error) {
      console.error(`❌ Error in scenario ${scenario.name}:`, error);
    }
    
    // Save gas estimate report
    const reportsDir = path.join(process.cwd(), 'reports', 'monitoring');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportFile = path.join(reportsDir, `gas_estimate-hardhat-${gasEstimate.ts}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(gasEstimate, null, 2));
    console.log(`📄 Report saved: ${reportFile}`);
  }
  
  console.log('\n✅ Gas fixture testing complete');
}

// Enhanced error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Gas fixture failed:', error);
    process.exit(1);
  });
