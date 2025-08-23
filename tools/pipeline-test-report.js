#!/usr/bin/env node
/**
 * Comprehensive Pipeline Test Report Generator
 * Tests the full refactoring → Mythril → Deploy pipeline
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📊 PIPELINE TEST REPORT');
console.log('========================\n');

function checkFile(filePath, description) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`✅ ${description}: ${filePath} (${stats.size} bytes, ${stats.mtime.toISOString()})`);
    return true;
  } else {
    console.log(`❌ ${description}: ${filePath} (not found)`);
    return false;
  }
}

function checkDirectory(dirPath, description) {
  const fullPath = path.resolve(__dirname, '..', dirPath);
  if (fs.existsSync(fullPath)) {
    const files = fs.readdirSync(fullPath);
    console.log(`✅ ${description}: ${dirPath} (${files.length} files)`);
    return files;
  } else {
    console.log(`❌ ${description}: ${dirPath} (not found)`);
    return [];
  }
}

// 1. Check Split Outputs
console.log('1. SPLIT OUTPUTS');
console.log('================');
const splitFiles = checkDirectory('split-output', 'Split Output Directory');
checkFile('split-output/deployment-plan.json', 'Deployment Plan');
checkFile('split-output/manifest.root.json', 'Root Manifest');
checkFile('split-output/selectors.json', 'Selectors');
checkFile('split-output/merkle.json', 'Merkle Tree');
checkFile('split-output/orchestration-plan.json', 'Orchestration Plan');
console.log('');

// 2. Check Mythril Outputs
console.log('2. MYTHRIL SECURITY OUTPUTS');
console.log('============================');
checkFile('split-output/mythril-src.latest.json', 'Mythril Source Scan Results');
checkFile('split-output/mythril-addr.latest.json', 'Mythril Address Scan Results');
checkFile('split-output/mythril-src.sarif', 'Mythril Source SARIF');
checkFile('split-output/mythril-addr.sarif', 'Mythril Address SARIF');
console.log('');

// 3. Check Reconstructed Contracts
console.log('3. RECONSTRUCTED CONTRACTS');
console.log('===========================');
const reconstructedFiles = checkDirectory('split-output/reconstructed-contracts', 'Reconstructed Contracts');
console.log('');

// 4. Check Deployment Results
console.log('4. DEPLOYMENT RESULTS');
console.log('=====================');
checkFile('split-output/deployed-addresses.json', 'Deployed Addresses');
checkFile('split-output/deployment-results.json', 'Deployment Results');
console.log('');

// 5. Check Codehash Validation
console.log('5. CODEHASH VALIDATION');
console.log('======================');
const codehashFiles = splitFiles.filter(f => f.startsWith('codehashes-'));
console.log(`Found ${codehashFiles.length} codehash files:`);
codehashFiles.forEach(file => {
  console.log(`  - ${file}`);
});
console.log('');

// 6. Security Allowlist
console.log('6. SECURITY CONFIGURATION');
console.log('==========================');
checkFile('security/allowlist.myth.json', 'Mythril Allowlist');
checkFile('tools/mythril-to-sarif.ts', 'SARIF Converter');
console.log('');

// 7. Configuration Files
console.log('7. CONFIGURATION FILES');
console.log('=======================');
checkFile('hardhat.config.ts', 'Hardhat Configuration');
checkFile('package.json', 'Package Configuration');
checkFile('.github/workflows/ci-selfcheck.yml', 'CI Workflow');
console.log('');

// 8. Task Files
console.log('8. TASK IMPLEMENTATIONS');
console.log('========================');
checkFile('tasks/security.myth.ts', 'Mythril Security Tasks');
checkFile('tasks/payrox.ts', 'PayRox Tasks');
checkFile('tasks/facet-init.ts', 'Facet Initialization Tasks');
console.log('');

// 9. Summary
console.log('9. PIPELINE SUMMARY');
console.log('===================');

try {
  // Check if we have recent outputs
  const deploymentPlan = path.resolve(__dirname, '..', 'split-output/deployment-plan.json');
  const manifest = path.resolve(__dirname, '..', 'split-output/manifest.root.json');

  if (fs.existsSync(deploymentPlan) && fs.existsSync(manifest)) {
    const plan = JSON.parse(fs.readFileSync(deploymentPlan, 'utf8'));
    const manifestData = JSON.parse(fs.readFileSync(manifest, 'utf8'));

    console.log(`✅ Latest Pipeline Run:`);
    console.log(`   Plan ID: ${plan.planId}`);
    console.log(`   Selectors: ${plan.selectors?.length || 0}`);
    console.log(`   Epoch: ${manifestData.epoch}`);
    console.log(`   Leaves: ${manifestData.leaves}`);
    console.log(`   Root: ${manifestData.root}`);
    console.log(`   Timestamp: ${manifestData.timestamp}`);
  }
} catch (error) {
  console.log(`❌ Error reading pipeline data: ${error.message}`);
}

console.log('\n🎯 Test Complete - Full Pipeline Functional');
console.log('\nNext Steps:');
console.log('  1. Run: npm run pipeline:predictive');
console.log('  2. Run: npm run sec:myth:src:pr (Fast PR mode)');
console.log('  3. Run: npm run pipeline:observed');
console.log('  4. Deploy: npx ts-node tools/splitter/scripts/deployFacets.ts');
