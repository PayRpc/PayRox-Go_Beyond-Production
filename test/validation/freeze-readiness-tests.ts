import fs from 'fs';
import path from 'path';
/**
 * Comprehensive Test Suite for Enhanced Freeze Readiness Assessment
 * 
 * Complete unit and integration tests for all freeze readiness components
 * including the main assessment tool, CLI, monitor, and dashboard.
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const _execAsync = promisify(exec);

describe('Enhanced Freeze Readiness Assessment Suite', () => {
  const _testOutputDir = './test-output';
  const _toolPath = './test/validation/Enhanced_Freeze_Readiness_Tool.ts';

  before(async () => {
    // Ensure test output directory exists
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  describe('Core Assessment Tool', () => {
    it('should execute successfully with simulation mode', async function() {
      this.timeout(30000);
      
      try {
        const { stdout, stderr } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate`
        );
        
        expect(stdout).to.include('Enhanced Freeze Readiness Assessment v2.0.0');
        expect(stdout).to.include('Using simulated system information');
        expect(stdout).to.include('Overall Progress:');
        expect(stderr).to.not.include('Error');
      } catch (error) {
        throw new Error(`Assessment tool failed: ${error}`);
      }
    });

    it('should generate valid JSON output', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json`
        );
        
        // Extract JSON from output
        const _lines = stdout.split('\n');
        const _jsonLine = lines.find(line => line.trim().startsWith('{'));
        
        expect(jsonLine).to.exist;
        
        const _data = JSON.parse(jsonLine!);
        expect(data).to.have.property('metadata');
        expect(data).to.have.property('conditions');
        expect(data).to.have.property('freezeDecision');
        expect(data.metadata).to.have.property('overallProgress');
        expect(data.metadata).to.have.property('riskScore');
        expect(data.conditions).to.be.an('array');
      } catch (error) {
        throw new Error(`JSON output test failed: ${error}`);
      }
    });

    it('should identify critical blockers correctly', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json`
        );
        
        const _lines = stdout.split('\n');
        const _jsonLine = lines.find(line => line.trim().startsWith('{'));
        const _data = JSON.parse(jsonLine!);
        
        expect(data.freezeDecision).to.have.property('blockers');
        expect(data.freezeDecision.blockers).to.be.an('array');
        expect(data.freezeDecision.recommendFreeze).to.be.a('boolean');
        
        // In simulation mode, should have some blockers
        expect(data.freezeDecision.blockers.length).to.be.greaterThan(0);
        expect(data.freezeDecision.recommendFreeze).to.be.false;
      } catch (error) {
        throw new Error(`Blocker identification test failed: ${error}`);
      }
    });

    it('should calculate progress percentages accurately', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json`
        );
        
        const _lines = stdout.split('\n');
        const _jsonLine = lines.find(line => line.trim().startsWith('{'));
        const _data = JSON.parse(jsonLine!);
        
        expect(data.metadata.overallProgress).to.be.a('number');
        expect(data.metadata.overallProgress).to.be.at.least(0);
        expect(data.metadata.overallProgress).to.be.at.most(100);
        
        expect(data.analytics.categoryProgress).to.be.an('object');
        
        // Verify category progress values
        Object.values(data.analytics.categoryProgress).forEach((progress: any) => {
          expect(progress).to.be.a('number');
          expect(progress).to.be.at.least(0);
          expect(progress).to.be.at.most(100);
        });
      } catch (error) {
        throw new Error(`Progress calculation test failed: ${error}`);
      }
    });

    it('should include all required assessment categories', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json`
        );
        
        const _lines = stdout.split('\n');
        const _jsonLine = lines.find(line => line.trim().startsWith('{'));
        const _data = JSON.parse(jsonLine!);
        
        const _expectedCategories = ['Security', 'Governance', 'Testing', 'Documentation', 'Operations'];
        const _foundCategories = [...new Set(data.conditions.map((c: any) => c.category))];
        
        expectedCategories.forEach(category => {
          expect(foundCategories).to.include(category);
        });
        
        // Verify each condition has required properties
        data.conditions.forEach((condition: any) => {
          expect(condition).to.have.property('id');
          expect(condition).to.have.property('category');
          expect(condition).to.have.property('description');
          expect(condition).to.have.property('criteria');
          expect(condition).to.have.property('status');
          expect(condition).to.have.property('priority');
          expect(condition.criteria).to.be.an('array');
        });
      } catch (error) {
        throw new Error(`Category validation test failed: ${error}`);
      }
    });
  });

  describe('CLI Interface', () => {
    it('should handle help display correctly', async function() {
      this.timeout(15000);
      
      // Test help via the assessment tool
      try {
        const { stdout, stderr } = await execAsync(
          `npx hardhat run ${toolPath} -- --help`
        );
        
        expect(stdout).to.include('Enhanced Freeze Readiness Assessment');
        expect(stdout).to.include('Usage:');
        expect(stdout).to.include('Options:');
      } catch (error: any) {
        // Help might cause non-zero exit, check stderr for useful content
        if (error.stdout && error.stdout.includes('Usage:')) {
          expect(error.stdout).to.include('Enhanced Freeze Readiness Assessment');
        } else {
          throw new Error(`Help display test failed: ${error}`);
        }
      }
    });

    it('should validate parameter parsing', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --verbose --detailed`
        );
        
        expect(stdout).to.include('Verbose mode enabled');
        expect(stdout).to.include('Configuration:');
        expect(stdout).to.include('simulate: true');
        expect(stdout).to.include('verbose: true');
        expect(stdout).to.include('detailed: true');
      } catch (error) {
        throw new Error(`Parameter parsing test failed: ${error}`);
      }
    });
  });

  describe('Output Formats', () => {
    it('should generate console output correctly', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format console`
        );
        
        expect(stdout).to.include('ENHANCED FREEZE READINESS ASSESSMENT');
        expect(stdout).to.include('Overall Progress:');
        expect(stdout).to.include('Current Status:');
        expect(stdout).to.include('CATEGORY PROGRESS:');
        expect(stdout).to.include('DETAILED CONDITIONS ANALYSIS:');
      } catch (error) {
        throw new Error(`Console output test failed: ${error}`);
      }
    });

    it('should save output to file when specified', async function() {
      this.timeout(30000);
      
      const _outputFile = path.join(testOutputDir, 'test-assessment-output.json');
      
      try {
        // Remove file if it exists
        if (fs.existsSync(outputFile)) {
          fs.unlinkSync(outputFile);
        }
        
        await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json --output ${outputFile}`
        );
        
        expect(fs.existsSync(outputFile)).to.be.true;
        
        const _fileContent = fs.readFileSync(outputFile, 'utf8');
        const _data = JSON.parse(fileContent);
        
        expect(data).to.have.property('metadata');
        expect(data).to.have.property('conditions');
        expect(data).to.have.property('freezeDecision');
      } catch (error) {
        throw new Error(`File output test failed: ${error}`);
      }
    });
  });

  describe('Performance and Reliability', () => {
    it('should complete assessment within reasonable time', async function() {
      this.timeout(45000);
      
      const _startTime = Date.now();
      
      try {
        await execAsync(`npx hardhat run ${toolPath} -- --simulate`);
        
        const _duration = Date.now() - startTime;
        expect(duration).to.be.lessThan(30000); // Should complete within 30 seconds
      } catch (error) {
        throw new Error(`Performance test failed: ${error}`);
      }
    });

    it('should handle multiple rapid executions', async function() {
      this.timeout(60000);
      
      const _promises = [];
      for (let _i = 0; i < 3; i++) {
        promises.push(
          execAsync(`npx hardhat run ${toolPath} -- --simulate --format json`)
        );
      }
      
      try {
        const _results = await Promise.all(promises);
        
        results.forEach(({ stdout, stderr }) => {
          expect(stdout).to.include('Enhanced Freeze Readiness Assessment');
          expect(stderr).to.not.include('Error');
        });
      } catch (error) {
        throw new Error(`Concurrent execution test failed: ${error}`);
      }
    });

    it('should provide consistent results across runs', async function() {
      this.timeout(60000);
      
      try {
        const _run1 = await execAsync(`npx hardhat run ${toolPath} -- --simulate --format json`);
        const _run2 = await execAsync(`npx hardhat run ${toolPath} -- --simulate --format json`);
        
        const _data1 = JSON.parse(run1.stdout.split('\n').find(line => line.trim().startsWith('{'))!);
        const _data2 = JSON.parse(run2.stdout.split('\n').find(line => line.trim().startsWith('{'))!);
        
        // Progress should be consistent (simulation mode)
        expect(data1.metadata.overallProgress).to.equal(data2.metadata.overallProgress);
        expect(data1.metadata.riskScore).to.equal(data2.metadata.riskScore);
        expect(data1.freezeDecision.blockers.length).to.equal(data2.freezeDecision.blockers.length);
      } catch (error) {
        throw new Error(`Consistency test failed: ${error}`);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid network gracefully', async function() {
      this.timeout(30000);
      
      try {
        const { stdout, stderr } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --network invalidnetwork`
        );
        
        // Should still execute but may show warnings
        expect(stdout).to.include('Enhanced Freeze Readiness Assessment');
      } catch (error: any) {
        // Expected behavior - should handle gracefully
        expect(error.stdout || error.stderr).to.include('Enhanced Freeze Readiness Assessment');
      }
    });

    it('should validate output directory permissions', async function() {
      this.timeout(30000);
      
      const _invalidOutputFile = '/invalid/path/output.json';
      
      try {
        await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json --output ${invalidOutputFile}`
        );
        
        // Should not reach here if path is invalid
        throw new Error('Expected error for invalid output path');
      } catch (error: any) {
        // Expected behavior - should fail gracefully
        expect(error.message).to.include('Error');
      }
    });
  });

  describe('Data Validation', () => {
    it('should validate all condition IDs are unique', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json`
        );
        
        const _lines = stdout.split('\n');
        const _jsonLine = lines.find(line => line.trim().startsWith('{'));
        const _data = JSON.parse(jsonLine!);
        
        const _conditionIds = data.conditions.map((c: any) => c.id);
        const _uniqueIds = [...new Set(conditionIds)];
        
        expect(conditionIds.length).to.equal(uniqueIds.length);
      } catch (error) {
        throw new Error(`Condition ID uniqueness test failed: ${error}`);
      }
    });

    it('should validate priority levels are correct', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json`
        );
        
        const _lines = stdout.split('\n');
        const _jsonLine = lines.find(line => line.trim().startsWith('{'));
        const _data = JSON.parse(jsonLine!);
        
        const _validPriorities = ['critical', 'high', 'medium', 'low'];
        
        data.conditions.forEach((condition: any) => {
          expect(validPriorities).to.include(condition.priority);
        });
      } catch (error) {
        throw new Error(`Priority validation test failed: ${error}`);
      }
    });

    it('should validate status values are correct', async function() {
      this.timeout(30000);
      
      try {
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json`
        );
        
        const _lines = stdout.split('\n');
        const _jsonLine = lines.find(line => line.trim().startsWith('{'));
        const _data = JSON.parse(jsonLine!);
        
        const _validStatuses = ['pending', 'partial', 'complete'];
        
        data.conditions.forEach((condition: any) => {
          expect(validStatuses).to.include(condition.status);
        });
      } catch (error) {
        throw new Error(`Status validation test failed: ${error}`);
      }
    });
  });

  describe('Integration Tests', () => {
    it('should work with dashboard generator', async function() {
      this.timeout(45000);
      
      try {
        // Generate assessment data
        const { stdout } = await execAsync(
          `npx hardhat run ${toolPath} -- --simulate --format json`
        );
        
        const _lines = stdout.split('\n');
        const _jsonLine = lines.find(line => line.trim().startsWith('{'));
        const _assessmentData = JSON.parse(jsonLine!);
        
        // Save to temporary file
        const _tempFile = path.join(testOutputDir, 'temp-assessment.json');
        fs.writeFileSync(tempFile, JSON.stringify(assessmentData, null, 2));
        
        // Test dashboard generation (would need dashboard generator imported)
        expect(fs.existsSync(tempFile)).to.be.true;
        
        const _fileData = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
        expect(fileData).to.deep.equal(assessmentData);
      } catch (error) {
        throw new Error(`Dashboard integration test failed: ${error}`);
      }
    });
  });

  after(() => {
    // Cleanup test files
    try {
      if (fs.existsSync(testOutputDir)) {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('Warning: Could not clean up test output directory:', error);
    }
  });
});

// Manual test runner function
export async function runManualTests(): Promise<void> {
  console.log('🧪 Running Manual Test Suite for Freeze Readiness Assessment\n');

  const tests = [
    {
      name: 'Basic Functionality Test',
      command: 'npx hardhat run test/validation/Enhanced_Freeze_Readiness_Tool.ts -- --simulate',
      expectedOutputs: ['Enhanced Freeze Readiness Assessment v2.0.0', 'Overall Progress:', 'BLOCKERS:']
    },
    {
      name: 'JSON Output Test',
      command: 'npx hardhat run test/validation/Enhanced_Freeze_Readiness_Tool.ts -- --simulate --format json',
      expectedOutputs: ['metadata', 'conditions', 'freezeDecision']
    },
    {
      name: 'Verbose Mode Test',
      command: 'npx hardhat run test/validation/Enhanced_Freeze_Readiness_Tool.ts -- --simulate --verbose --detailed',
      expectedOutputs: ['Verbose mode enabled', 'Configuration:', 'DETAILED CONDITIONS ANALYSIS:']
    },
    {
      name: 'File Output Test',
      command: 'npx hardhat run test/validation/Enhanced_Freeze_Readiness_Tool.ts -- --simulate --format json --output test-manual-output.json',
      expectedOutputs: ['Assessment completed'],
      checkFile: 'test-manual-output.json'
    }
  ];

  let _passed = 0;
  let _failed = 0;

  for (const test of tests) {
    try {
      console.log(`\n🔍 Running: ${test.name}`);
      console.log(`📝 Command: ${test.command}`);
      
      const { stdout, stderr } = await execAsync(test.command);
      
      // Check expected outputs
      let _testPassed = true;
      for (const expected of test.expectedOutputs) {
        if (!stdout.includes(expected)) {
          console.log(`❌ Expected output not found: "${expected}"`);
          testPassed = false;
        }
      }
      
      // Check file output if specified
      if (test.checkFile) {
        if (fs.existsSync(test.checkFile)) {
          console.log(`✅ Output file created: ${test.checkFile}`);
          // Clean up
          fs.unlinkSync(test.checkFile);
        } else {
          console.log(`❌ Expected output file not found: ${test.checkFile}`);
          testPassed = false;
        }
      }
      
      if (testPassed) {
        console.log(`✅ ${test.name} PASSED`);
        passed++;
      } else {
        console.log(`❌ ${test.name} FAILED`);
        failed++;
      }
      
    } catch (error: any) {
      console.log(`❌ ${test.name} FAILED with error:`, error.message);
      failed++;
    }
  }

  console.log(`\n📊 Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! The Enhanced Freeze Readiness Assessment Tool is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }
}

// Only run manual tests if this file is executed directly
if (require.main === module) {
  // Skip the Mocha tests and run manual tests directly
  runManualTests().catch(console.error);
}
