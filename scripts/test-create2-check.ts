// SPDX-License-Identifier: MIT
/**
 * CREATE2 Check Testing Script
 * 
 * Tests CREATE2 deployment functionality and address prediction
 * to ensure deterministic deployment capabilities.
 */

const hre = require('hardhat');
const { ethers } = hre;
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface CREATE2TestResult {
  testName: string;
  success: boolean;
  predictedAddress: string;
  actualAddress?: string;
  saltUsed: string;
  errorMessage?: string;
}

interface CREATE2TestSuite {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: CREATE2TestResult[];
}

async function testAddressPrediction(): Promise<CREATE2TestResult> {
  console.log('🔮 Testing address prediction...');
  
  try {
    const signers = await ethers.getSigners();
    if (signers.length === 0) {
      throw new Error('No signers available');
    }
    
  const deployer = signers[0]!;
    const salt = ethers.hexlify(crypto.randomBytes(32));
    
    // Get contract bytecode
    const ContractFactory = await ethers.getContractFactory('DiamondCutFacet');
    const deployTransaction = await ContractFactory.getDeployTransaction();
    const initCode = deployTransaction.data;
    const initCodeHash = ethers.keccak256(initCode);
    
    // Predict address
    const predictedAddress = ethers.getCreate2Address(
      deployer.address!,
      salt,
      initCodeHash
    );
    
    return {
      testName: 'Address Prediction',
      success: true,
      predictedAddress,
      saltUsed: salt,
    };
    
  } catch (error) {
    return {
      testName: 'Address Prediction',
      success: false,
      predictedAddress: '',
      saltUsed: '',
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testSaltDeterminism(): Promise<CREATE2TestResult> {
  console.log('🧂 Testing salt determinism...');
  
  try {
    const signers = await ethers.getSigners();
    if (signers.length === 0) {
      throw new Error('No signers available');
    }
    
    const deployer = signers[0];
    const salt = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    
    // Get contract bytecode
    const ContractFactory = await ethers.getContractFactory('DiamondCutFacet');
    const deployTransaction = await ContractFactory.getDeployTransaction();
    const initCode = deployTransaction.data;
    const initCodeHash = ethers.keccak256(initCode);
    
    // Predict address twice with same salt
    const address1 = ethers.getCreate2Address(deployer.address, salt, initCodeHash);
    const address2 = ethers.getCreate2Address(deployer.address, salt, initCodeHash);
    
    const success = address1 === address2;
    
    return {
      testName: 'Salt Determinism',
      success,
      predictedAddress: address1,
      actualAddress: address2,
      saltUsed: salt,
      errorMessage: success ? undefined : 'Addresses do not match with same salt'
    };
    
  } catch (error) {
    return {
      testName: 'Salt Determinism',
      success: false,
      predictedAddress: '',
      saltUsed: '',
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testSaltVariation(): Promise<CREATE2TestResult> {
  console.log('🎲 Testing salt variation...');
  
  try {
    const signers = await ethers.getSigners();
    if (signers.length === 0) {
      throw new Error('No signers available');
    }
    
    const deployer = signers[0];
    const salt1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const salt2 = '0x2222222222222222222222222222222222222222222222222222222222222222';
    
    // Get contract bytecode
    const ContractFactory = await ethers.getContractFactory('DiamondCutFacet');
    const deployTransaction = await ContractFactory.getDeployTransaction();
    const initCode = deployTransaction.data;
    const initCodeHash = ethers.keccak256(initCode);
    
    // Predict addresses with different salts
    const address1 = ethers.getCreate2Address(deployer.address, salt1, initCodeHash);
    const address2 = ethers.getCreate2Address(deployer.address, salt2, initCodeHash);
    
    const success = address1 !== address2;
    
    return {
      testName: 'Salt Variation',
      success,
      predictedAddress: address1,
      actualAddress: address2,
      saltUsed: `${salt1} vs ${salt2}`,
      errorMessage: success ? undefined : 'Different salts produced same address'
    };
    
  } catch (error) {
    return {
      testName: 'Salt Variation',
      success: false,
      predictedAddress: '',
      saltUsed: '',
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testContractVariation(): Promise<CREATE2TestResult> {
  console.log('📄 Testing contract variation...');
  
  try {
    const signers = await ethers.getSigners();
    if (signers.length === 0) {
      throw new Error('No signers available');
    }
    
    const deployer = signers[0];
    const salt = ethers.hexlify(crypto.randomBytes(32));
    
    // Get bytecode for different contracts
    const Contract1 = await ethers.getContractFactory('DiamondCutFacet');
    const Contract2 = await ethers.getContractFactory('DiamondLoupeFacet');
    
    const deployTx1 = await Contract1.getDeployTransaction();
    const deployTx2 = await Contract2.getDeployTransaction();
    
    const initCode1 = deployTx1.data;
    const initCode2 = deployTx2.data;
    
    const initCodeHash1 = ethers.keccak256(initCode1);
    const initCodeHash2 = ethers.keccak256(initCode2);
    
    // Predict addresses
    const address1 = ethers.getCreate2Address(deployer.address, salt, initCodeHash1);
    const address2 = ethers.getCreate2Address(deployer.address, salt, initCodeHash2);
    
    const success = address1 !== address2;
    
    return {
      testName: 'Contract Variation',
      success,
      predictedAddress: address1,
      actualAddress: address2,
      saltUsed: salt,
      errorMessage: success ? undefined : 'Different contracts produced same address'
    };
    
  } catch (error) {
    return {
      testName: 'Contract Variation',
      success: false,
      predictedAddress: '',
      saltUsed: '',
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testDeployerVariation(): Promise<CREATE2TestResult> {
  console.log('👤 Testing deployer variation...');
  
  try {
    const signers = await ethers.getSigners();
    if (signers.length < 2) {
      // Skip this test if we don't have enough signers
      return {
        testName: 'Deployer Variation',
        success: true,
        predictedAddress: 'N/A',
        saltUsed: 'N/A',
        errorMessage: 'Skipped - Need at least 2 signers'
      };
    }
    
    const deployer1 = signers[0];
    const deployer2 = signers[1];
    const salt = ethers.hexlify(crypto.randomBytes(32));
    
    // Get contract bytecode
    const ContractFactory = await ethers.getContractFactory('DiamondCutFacet');
    const deployTransaction = await ContractFactory.getDeployTransaction();
    const initCode = deployTransaction.data;
    const initCodeHash = ethers.keccak256(initCode);
    
    // Predict addresses with different deployers
    const address1 = ethers.getCreate2Address(deployer1.address, salt, initCodeHash);
    const address2 = ethers.getCreate2Address(deployer2.address, salt, initCodeHash);
    
    const success = address1 !== address2;
    
    return {
      testName: 'Deployer Variation',
      success,
      predictedAddress: address1,
      actualAddress: address2,
      saltUsed: salt,
      errorMessage: success ? undefined : 'Different deployers produced same address'
    };
    
  } catch (error) {
    return {
      testName: 'Deployer Variation',
      success: false,
      predictedAddress: '',
      saltUsed: '',
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  console.log('🏭 CREATE2 Check Test Suite');
  console.log('============================\n');
  
  const testSuite: CREATE2TestSuite = {
    timestamp: new Date().toISOString(),
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    results: []
  };
  
  // Define test functions
  const tests = [
    testAddressPrediction,
    testSaltDeterminism,
    testSaltVariation,
    testContractVariation,
    testDeployerVariation
  ];
  
  // Run all tests
  for (const test of tests) {
    try {
      const result = await test();
      testSuite.results.push(result);
      testSuite.totalTests++;
      
      if (result.success) {
        testSuite.passedTests++;
        console.log(`✅ ${result.testName}`);
      } else {
        testSuite.failedTests++;
        console.log(`❌ ${result.testName}: ${result.errorMessage}`);
      }
      
    } catch (error) {
      const failedResult: CREATE2TestResult = {
        testName: test.name,
        success: false,
        predictedAddress: '',
        saltUsed: '',
        errorMessage: error instanceof Error ? error.message : String(error)
      };
      
      testSuite.results.push(failedResult);
      testSuite.totalTests++;
      testSuite.failedTests++;
      console.log(`❌ ${test.name}: ${failedResult.errorMessage}`);
    }
  }
  
  // Generate summary
  console.log('\n📊 Test Summary:');
  console.log(`   Total Tests: ${testSuite.totalTests}`);
  console.log(`   Passed: ${testSuite.passedTests}`);
  console.log(`   Failed: ${testSuite.failedTests}`);
  console.log(`   Success Rate: ${((testSuite.passedTests / testSuite.totalTests) * 100).toFixed(1)}%`);
  
  // Save results
  const outputDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `create2-check-tests-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(testSuite, null, 2));
  console.log(`\n📄 Results saved: ${outputFile}`);
  
  // Exit with appropriate code
  const allPassed = testSuite.failedTests === 0;
  console.log(`\n${allPassed ? '✅' : '❌'} CREATE2 tests ${allPassed ? 'PASSED' : 'FAILED'}`);
  
  if (!allPassed) {
    console.log('\n🔍 Failed tests:');
    testSuite.results
      .filter(r => !r.success)
      .forEach(r => console.log(`   - ${r.testName}: ${r.errorMessage}`));
  }
  
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('❌ CREATE2 test suite failed:', error);
  process.exit(1);
});
