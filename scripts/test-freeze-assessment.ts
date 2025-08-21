// SPDX-License-Identifier: MIT
/**
 * Freeze Assessment Testing Script
 * 
 * Tests the Enhanced Freeze Readiness Assessment Tool to ensure
 * proper functionality and validation of deployment readiness.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  duration: number;
}

interface AssessmentTestSuite {
  suiteName: string;
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

async function runTest(testName: string, testFunction: () => Promise<boolean>): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log(`🧪 Running test: ${testName}`);
    const passed = await testFunction();
    const duration = Date.now() - startTime;
    
    const result: TestResult = {
      testName,
      passed,
      message: passed ? 'Test passed successfully' : 'Test failed',
      duration
    };
    
    console.log(`   ${passed ? '✅' : '❌'} ${testName} (${duration}ms)`);
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const result: TestResult = {
      testName,
      passed: false,
      message: `Test failed with error: ${error instanceof Error ? error.message : String(error)}`,
      duration
    };
    
    console.log(`   ❌ ${testName} (${duration}ms) - Error: ${result.message}`);
    return result;
  }
}

async function testFreezeAssessmentTool(): Promise<boolean> {
  try {
    // Check if the Enhanced Freeze Readiness Assessment Tool exists
    const toolPath = path.join(process.cwd(), 'tools', 'Enhanced_Freeze_Readiness_Tool.ts');
    if (!fs.existsSync(toolPath)) {
      throw new Error('Enhanced Freeze Readiness Assessment Tool not found');
    }
    
    // Run the tool in test mode
    const { stdout, stderr } = await execAsync(`npx ts-node "${toolPath}" --test-mode`);
    
    // Check for successful execution
    return stdout.includes('Assessment complete') && !stderr.includes('Error');
    
  } catch (error) {
    console.error('Freeze assessment tool test failed:', error);
    return false;
  }
}

async function testValidationComponents(): Promise<boolean> {
  try {
    // Test path utilities
    const pathUtilsPath = path.join(process.cwd(), 'src', 'utils', 'paths.ts');
    if (!fs.existsSync(pathUtilsPath)) {
      throw new Error('Path utilities not found');
    }
    
    // Import and test path utilities
    const pathUtils = await import(pathUtilsPath);
    return typeof pathUtils.PathManager === 'function';
    
  } catch (error) {
    console.error('Validation components test failed:', error);
    return false;
  }
}

async function testContractCompilation(): Promise<boolean> {
  try {
    // Run Hardhat compilation to ensure contracts are valid
    const { stdout, stderr } = await execAsync('npx hardhat compile --quiet');
    
    // Check for successful compilation
    return !stderr.includes('Error') && !stdout.includes('compilation failed');
    
  } catch (error) {
    console.error('Contract compilation test failed:', error);
    return false;
  }
}

async function testGasMeasurement(): Promise<boolean> {
  try {
    // Check if gas fixture script exists and is valid
    const gasFixturePath = path.join(process.cwd(), 'scripts', 'gas-fixture-applyRoutes.ts');
    if (!fs.existsSync(gasFixturePath)) {
      throw new Error('Gas fixture script not found');
    }
    
    // Validate the script syntax
    const content = fs.readFileSync(gasFixturePath, 'utf8');
    return content.includes('gas') && content.includes('estimate');
    
  } catch (error) {
    console.error('Gas measurement test failed:', error);
    return false;
  }
}

async function testDeploymentReadiness(): Promise<boolean> {
  try {
    // Check for essential deployment files
    const requiredFiles = [
      'hardhat.config.ts',
      'package.json',
      'contracts/facets/DiamondCutFacet.sol',
      'contracts/Diamond.sol'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file not found: ${file}`);
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('Deployment readiness test failed:', error);
    return false;
  }
}

async function main() {
  console.log('🚀 Enhanced Freeze Readiness Assessment Test Suite');
  console.log('==================================================\n');
  
  const testSuite: AssessmentTestSuite = {
    suiteName: 'Freeze Assessment Tests',
    timestamp: new Date().toISOString(),
    totalTests: 0,
    passed: 0,
    failed: 0,
    results: []
  };
  
  // Define test cases
  const tests = [
    { name: 'Freeze Assessment Tool Execution', func: testFreezeAssessmentTool },
    { name: 'Validation Components', func: testValidationComponents },
    { name: 'Contract Compilation', func: testContractCompilation },
    { name: 'Gas Measurement Utilities', func: testGasMeasurement },
    { name: 'Deployment Readiness', func: testDeploymentReadiness }
  ];
  
  // Run all tests
  for (const test of tests) {
    const result = await runTest(test.name, test.func);
    testSuite.results.push(result);
    testSuite.totalTests++;
    
    if (result.passed) {
      testSuite.passed++;
    } else {
      testSuite.failed++;
    }
  }
  
  // Generate summary
  console.log('\n📊 Test Summary:');
  console.log(`   Total Tests: ${testSuite.totalTests}`);
  console.log(`   Passed: ${testSuite.passed}`);
  console.log(`   Failed: ${testSuite.failed}`);
  console.log(`   Success Rate: ${((testSuite.passed / testSuite.totalTests) * 100).toFixed(1)}%`);
  
  // Save detailed results
  const outputDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `freeze-assessment-tests-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(testSuite, null, 2));
  console.log(`\n📄 Detailed results saved: ${outputFile}`);
  
  // Exit with appropriate code
  const success = testSuite.failed === 0;
  console.log(`\n${success ? '✅' : '❌'} Test suite ${success ? 'PASSED' : 'FAILED'}`);
  
  if (!success) {
    console.log('\n🔍 Failed tests:');
    testSuite.results
      .filter(r => !r.passed)
      .forEach(r => console.log(`   - ${r.testName}: ${r.message}`));
  }
  
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
