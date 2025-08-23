import { ethers } from 'hardhat';
import fs from 'fs';

async function testDeployment() {
  console.log('🔍 Testing Deployed Contracts...');
  console.log('================================');

  try {
    // Check if deployment addresses exist
    if (!fs.existsSync('split-output/deployment-addresses.json')) {
      console.log('❌ No deployment addresses found');
      return;
    }

    const addresses = JSON.parse(fs.readFileSync('split-output/deployment-addresses.json', 'utf8'));
    console.log('📋 Found deployed contracts:', Object.keys(addresses));

    // Get network info
    const [signer] = await ethers.getSigners();
    console.log('🔗 Connected to network with signer:', signer.address);

    // Test each deployed contract
    for (const [contractName, address] of Object.entries(addresses)) {
      console.log(`\n🧪 Testing ${contractName} at ${address}...`);

      try {
        // Get contract code to verify deployment
        const code = await ethers.provider.getCode(address as string);

        if (code === '0x') {
          console.log(`❌ ${contractName}: No code at address`);
          continue;
        }

        console.log(`✅ ${contractName}: Contract deployed (${Math.floor(code.length / 2)} bytes)`);

        // Try to get the contract instance and test a basic call
        try {
          // For facets that support ERC165, test supportsInterface
          const contract = new ethers.Contract(
            address as string,
            ['function supportsInterface(bytes4) external view returns (bool)'],
            signer
          );

          // Test ERC165 interface ID (0x01ffc9a7)
          const supports = await contract.supportsInterface('0x01ffc9a7');
          console.log(`  📞 supportsInterface(ERC165): ${supports}`);
        } catch (error) {
          console.log(`  ⚠️ Function call test skipped (not ERC165 compatible)`);
        }

      } catch (error) {
        console.log(`❌ ${contractName}: Error - ${error.message}`);
      }
    }

    console.log('\n🎉 Deployment test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testDeployment().catch(console.error);
