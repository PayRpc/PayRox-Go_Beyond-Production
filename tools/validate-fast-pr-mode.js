#!/usr/bin/env node
/**
 * Fast PR Mode Validation Script
 * Tests the Mythril security scanning configuration
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🔍 Fast PR Mode Validation\n');

// Test 1: Check if tasks are properly registered
console.log('1. Checking Hardhat task registration...');
try {
  const helpOutput = execSync('npx hardhat help security:myth:src', {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..')
  });

  if (helpOutput.includes('failOn')) {
    console.log('   ✅ security:myth:src task has failOn parameter');
  } else {
    console.log('   ❌ security:myth:src task missing failOn parameter');
  }
} catch (error) {
  console.log('   ❌ Error checking security:myth:src task:', error.message);
}

// Test 2: Check NPM scripts
console.log('\n2. Checking NPM script configuration...');
try {
  const packageJson = require('../package.json');

  const requiredScripts = [
    'sec:myth:src:pr',
    'sec:myth:addr:pr',
    'pipeline:predictive:pr',
    'pipeline:observed:pr'
  ];

  for (const script of requiredScripts) {
    if (packageJson.scripts[script]) {
      console.log(`   ✅ ${script} script exists`);

      // Check if it uses cross-env and --failOn high
      if (packageJson.scripts[script].includes('cross-env MYTH_FAIL_ON=high') &&
          packageJson.scripts[script].includes('--failOn high')) {
        console.log(`      ✅ Correctly configured for Fast PR mode`);
      } else {
        console.log(`      ❌ Missing Fast PR mode configuration`);
      }
    } else {
      console.log(`   ❌ ${script} script missing`);
    }
  }
} catch (error) {
  console.log('   ❌ Error checking package.json:', error.message);
}

// Test 3: Check cross-env dependency
console.log('\n3. Checking cross-env dependency...');
try {
  const packageJson = require('../package.json');
  if (packageJson.devDependencies && packageJson.devDependencies['cross-env']) {
    console.log('   ✅ cross-env dependency installed');
  } else {
    console.log('   ❌ cross-env dependency missing');
  }
} catch (error) {
  console.log('   ❌ Error checking dependencies:', error.message);
}

// Test 4: Check workflow configuration
console.log('\n4. Checking CI workflow configuration...');
try {
  const fs = require('fs');
  const workflowPath = path.resolve(__dirname, '../.github/workflows/ci-selfcheck.yml');
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  if (workflowContent.includes('pull_request:')) {
    console.log('   ✅ CI workflow includes pull_request trigger');
  } else {
    console.log('   ❌ CI workflow missing pull_request trigger');
  }

  if (workflowContent.includes('MYTH_FAIL_ON=high')) {
    console.log('   ✅ CI workflow sets MYTH_FAIL_ON=high for PRs');
  } else {
    console.log('   ❌ CI workflow missing Fast PR mode configuration');
  }

  if (workflowContent.includes('github.event_name == \'pull_request\'')) {
    console.log('   ✅ CI workflow has conditional PR logic');
  } else {
    console.log('   ❌ CI workflow missing conditional PR logic');
  }
} catch (error) {
  console.log('   ❌ Error checking workflow:', error.message);
}

// Test 5: Validate task import in hardhat.config.ts
console.log('\n5. Checking Hardhat configuration...');
try {
  const fs = require('fs');
  const configPath = path.resolve(__dirname, '../hardhat.config.ts');
  const configContent = fs.readFileSync(configPath, 'utf8');

  if (configContent.includes('./tasks/security.myth')) {
    console.log('   ✅ security.myth tasks imported in hardhat.config.ts');
  } else {
    console.log('   ❌ security.myth tasks not imported in hardhat.config.ts');
  }
} catch (error) {
  console.log('   ❌ Error checking hardhat.config.ts:', error.message);
}

console.log('\n🎯 Fast PR Mode Validation Complete\n');
console.log('Usage Examples:');
console.log('  Fast scanning (PRs): npm run sec:myth:src:pr');
console.log('  Strict scanning (main): npm run sec:myth:src');
console.log('  Manual override: MYTH_FAIL_ON=high npm run sec:myth:src');
console.log('  Full PR pipeline: npm run pipeline:predictive:pr');
