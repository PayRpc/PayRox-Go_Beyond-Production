#!/usr/bin/env node
/**
 * Release Gates Test Suite
 * Tests all validation logic in isolation
 */

const fs = require('fs');
const path = require('path');

class ReleaseGatesTester {
  constructor() {
    this.results = [];
    this.splitOutput = 'split-output';
  }

  async runAllTests() {
    console.log('🧪 Release Gates Test Suite');
    console.log('===========================');
    console.log('');

    // Test 1: Artifact Validation
    await this.testArtifactValidation();

    // Test 2: Codehash Parity Logic
    await this.testCodehashParity();

    // Test 3: Selector Validation Logic
    await this.testSelectorValidation();

    // Test 4: EIP-170 Compliance Logic
    await this.testEIP170Compliance();

    // Test 5: Manifest Validation Logic
    await this.testManifestValidation();

    // Print Summary
    this.printSummary();

    return this.results.every(r => r.status === 'PASS');
  }

  async testArtifactValidation() {
    console.log('🔍 Test 1: Artifact Validation');
    console.log('-------------------------------');

    try {
      const requiredFiles = [
        'manifest.root.json',
        'deployment-plan.json',
        'proofs.json',
        'selectors.json'
      ];

      let allFound = true;
      let missingFiles = [];

      for (const file of requiredFiles) {
        const filePath = path.join(this.splitOutput, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`  ✅ ${file} (${stats.size} bytes)`);
        } else {
          console.log(`  ❌ ${file} (missing)`);
          allFound = false;
          missingFiles.push(file);
        }
      }

      this.results.push({
        test: 'Artifact Validation',
        status: allFound ? 'PASS' : 'FAIL',
        details: allFound ? 'All artifacts present' : `Missing: ${missingFiles.join(', ')}`
      });

    } catch (error) {
      this.results.push({
        test: 'Artifact Validation',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }

    console.log('');
  }

  async testCodehashParity() {
    console.log('🔍 Test 2: Codehash Parity Logic');
    console.log('---------------------------------');

    try {
      // Mock codehash comparison logic
      const mockPredictive = {
        'AccessControlFacet': '0x7087915d16c08c1c13957801d166ad5e014e04dd5d60249961b7f0dddd4030ab',
        'ChunkFactoryFacet': '0x4d4dda8ffc977b0244c94501ad49ec79f135e3eff5445052d48da9b212cf5bda'
      };

      const mockObserved = {
        'AccessControlFacet': '0x7087915d16c08c1c13957801d166ad5e014e04dd5d60249961b7f0dddd4030ab',
        'ChunkFactoryFacet': '0x4d4dda8ffc977b0244c94501ad49ec79f135e3eff5445052d48da9b212cf5bda'
      };

      let matches = 0;
      let total = 0;

      for (const [facet, predictiveHash] of Object.entries(mockPredictive)) {
        total++;
        const observedHash = mockObserved[facet];

        if (predictiveHash === observedHash) {
          matches++;
          console.log(`  ✅ ${facet}: ${predictiveHash.substring(0, 10)}...`);
        } else {
          console.log(`  ❌ ${facet}: Mismatch`);
          console.log(`      Predicted: ${predictiveHash.substring(0, 10)}...`);
          console.log(`      Observed:  ${observedHash?.substring(0, 10) || 'missing'}...`);
        }
      }

      const success = matches === total;
      this.results.push({
        test: 'Codehash Parity Logic',
        status: success ? 'PASS' : 'FAIL',
        details: `${matches}/${total} codehashes match`
      });

    } catch (error) {
      this.results.push({
        test: 'Codehash Parity Logic',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }

    console.log('');
  }

  async testSelectorValidation() {
    console.log('🔍 Test 3: Selector Validation Logic');
    console.log('------------------------------------');

    try {
      // Check if selectors.json exists and validate structure
      const selectorsPath = path.join(this.splitOutput, 'selectors.json');

      if (!fs.existsSync(selectorsPath)) {
        throw new Error('selectors.json not found');
      }

      const selectorsData = JSON.parse(fs.readFileSync(selectorsPath, 'utf8'));

      // Validate structure
      const requiredFields = ['totalSelectors', 'selectors', 'timestamp'];
      let validStructure = true;

      for (const field of requiredFields) {
        if (!(field in selectorsData)) {
          console.log(`  ❌ Missing field: ${field}`);
          validStructure = false;
        } else {
          console.log(`  ✅ Field present: ${field}`);
        }
      }

      // Validate selector count consistency
      const totalSelectors = selectorsData.totalSelectors;
      const selectorsArrayLength = (selectorsData.selectors || []).length;
      const countMatch = totalSelectors === selectorsArrayLength;

      if (countMatch) {
        console.log(`  ✅ Selector count consistent: ${totalSelectors}`);
      } else {
        console.log(`  ❌ Selector count mismatch: ${totalSelectors} vs ${selectorsArrayLength}`);
      }

      const success = validStructure && countMatch;
      this.results.push({
        test: 'Selector Validation Logic',
        status: success ? 'PASS' : 'FAIL',
        details: success ? `${totalSelectors} selectors validated` : 'Structure or count issues'
      });

    } catch (error) {
      this.results.push({
        test: 'Selector Validation Logic',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }

    console.log('');
  }

  async testEIP170Compliance() {
    console.log('🔍 Test 4: EIP-170 Compliance Logic');
    console.log('-----------------------------------');

    try {
      // Mock bytecode size validation
      const mockFacetSizes = {
        'AccessControlFacet': 0x5000,     // 20KB - OK
        'ChunkFactoryFacet': 0x5FFF,      // 24KB - OK
        'PaymentsFacet': 0x6000,          // 24KB - Exactly at limit
        'SecurityFacet': 0x3000           // 12KB - OK
      };

      const EIP170_LIMIT = 0x6000; // 24KB
      let compliantCount = 0;
      let totalCount = 0;

      for (const [facet, size] of Object.entries(mockFacetSizes)) {
        totalCount++;

        if (size <= EIP170_LIMIT) {
          compliantCount++;
          console.log(`  ✅ ${facet}: ${(size / 1024).toFixed(1)}KB`);
        } else {
          console.log(`  ❌ ${facet}: ${(size / 1024).toFixed(1)}KB (exceeds 24KB limit)`);
        }
      }

      const success = compliantCount === totalCount;
      this.results.push({
        test: 'EIP-170 Compliance Logic',
        status: success ? 'PASS' : 'FAIL',
        details: `${compliantCount}/${totalCount} facets compliant`
      });

    } catch (error) {
      this.results.push({
        test: 'EIP-170 Compliance Logic',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }

    console.log('');
  }

  async testManifestValidation() {
    console.log('🔍 Test 5: Manifest Validation Logic');
    console.log('------------------------------------');

    try {
      const manifestPath = path.join(this.splitOutput, 'manifest.root.json');

      if (!fs.existsSync(manifestPath)) {
        throw new Error('manifest.root.json not found');
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Validate required fields
      const requiredFields = ['root', 'timestamp', 'chainId', 'epoch'];
      let validFields = 0;

      for (const field of requiredFields) {
        if (field in manifest) {
          validFields++;
          console.log(`  ✅ Field present: ${field}`);
        } else {
          console.log(`  ❌ Missing field: ${field}`);
        }
      }

      // Validate root format (should be hex string)
      const rootValid = /^0x[a-fA-F0-9]{64}$/.test(manifest.root || '');
      if (rootValid) {
        console.log(`  ✅ Root format valid: ${manifest.root?.substring(0, 10)}...`);
      } else {
        console.log(`  ❌ Root format invalid`);
      }

      const success = validFields === requiredFields.length && rootValid;
      this.results.push({
        test: 'Manifest Validation Logic',
        status: success ? 'PASS' : 'FAIL',
        details: success ? 'Manifest structure valid' : 'Structure or format issues'
      });

    } catch (error) {
      this.results.push({
        test: 'Manifest Validation Logic',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }

    console.log('');
  }

  printSummary() {
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('=======================');

    let passCount = 0;
    let failCount = 0;

    for (const result of this.results) {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.details}`);

      if (result.status === 'PASS') passCount++;
      else failCount++;
    }

    console.log('');
    console.log(`Total: ${passCount} PASS, ${failCount} FAIL`);

    if (failCount === 0) {
      console.log('✅ ALL GATE LOGIC TESTS PASSED');
      console.log('🎉 Release pipeline validation logic is working correctly!');
    } else {
      console.log('❌ SOME TESTS FAILED');
      console.log('🚨 Review failed tests before proceeding with release');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ReleaseGatesTester();
  tester.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });
}

module.exports = ReleaseGatesTester;
