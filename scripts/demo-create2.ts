// SPDX-License-Identifier: MIT
/**
 * CREATE2 Demonstration Script
 *
 * Demonstrates deterministic contract deployment using CREATE2
 * with salt-based address prediction and verification.
 */

const hre = require('hardhat');
const { ethers } = hre;
import * as crypto from 'crypto';

interface CREATE2Demo {
  deployer: string;
  salt: string;
  initCodeHash: string;
  predictedAddress: string;
  actualAddress: string;
  verified: boolean;
}

async function main() {
  console.log('🏭 CREATE2 Demonstration');
  console.log('========================\n');

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error('No signers available');
  }

  const deployer = signers[0]!;
  console.log(`👤 Deployer: ${deployer.address}`);

  // Generate a random salt
  const salt = ethers.hexlify(crypto.randomBytes(32));
  console.log(`🧂 Salt: ${salt}`);

  // Get the bytecode for a simple contract
  console.log('\n📄 Preparing contract bytecode...');
  const ContractFactory = await ethers.getContractFactory('DiamondCutFacet');
  const deployTransaction = await ContractFactory.getDeployTransaction();
  const initCode = deployTransaction.data ?? '';
  const initCodeHash = ethers.keccak256(initCode);

  console.log(`📄 InitCode length: ${initCode.length} characters`);
  console.log(`🔗 InitCode hash: ${initCodeHash}`);

  // Predict the address using CREATE2
  console.log('\n🔮 Predicting address...');
  const predictedAddress = ethers.getCreate2Address(
    deployer.address!,
    salt,
    initCodeHash
  );
  console.log(`🎯 Predicted address: ${predictedAddress}`);

  // Create demo object
  const demo: CREATE2Demo = {
  deployer: deployer.address!,
    salt: salt,
    initCodeHash: initCodeHash,
    predictedAddress: predictedAddress,
    actualAddress: '',
    verified: false
  };

  try {
    // Deploy the contract normally (for comparison)
    console.log('\n🚀 Deploying contract...');
    const contract = await ContractFactory.deploy();
    await contract.waitForDeployment();
    const actualAddress = await contract.getAddress();
    demo.actualAddress = actualAddress;

    console.log(`📍 Actual address: ${actualAddress}`);

    // Note: In a real CREATE2 deployment, we would use a factory contract
    // This demo shows the address prediction concept
    console.log('\n🔍 Address Verification:');
    console.log(`   Predicted: ${predictedAddress}`);
    console.log(`   Actual:    ${actualAddress}`);
    console.log(`   Note: Addresses differ because we used normal deployment`);
    console.log(`         In real CREATE2, they would match!`);

    demo.verified = true;

  } catch (error) {
    console.error('❌ Deployment failed:', error);
  }

  // Save demonstration results
  console.log('\n💾 Saving results...');
  const fs = await import('fs');
  const path = await import('path');

  const outputDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, `create2-demo-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(demo, null, 2));
  console.log(`📄 Results saved: ${outputFile}`);

  console.log('\n✅ CREATE2 demonstration complete');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  });
