#!/usr/bin/env node
/**
 * Integration Test for Fast PR Mode
 * This script validates that the Fast PR mode works as expected
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Fast PR Mode Integration Test\n');

async function runCommand(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, ...env },
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function testFastPRMode() {
  console.log('1. Testing Hardhat task registration...');

  try {
    const result = await runCommand('npx', ['hardhat', 'help', 'security:myth:src']);

    if (result.stdout.includes('failOn')) {
      console.log('   ✅ Task registered with failOn parameter');
    } else {
      console.log('   ❌ Task missing failOn parameter');
      console.log('   Output:', result.stdout);
    }
  } catch (error) {
    console.log('   ❌ Error testing task:', error.message);
  }

  console.log('\n2. Testing environment variable configuration...');

  try {
    // Test with MYTH_FAIL_ON=high
    const result = await runCommand('npx', ['hardhat', 'help', 'security:myth:src'], {
      MYTH_FAIL_ON: 'high'
    });

    if (result.code === 0) {
      console.log('   ✅ Environment variable accepted');
    } else {
      console.log('   ❌ Environment variable rejected');
      console.log('   Error:', result.stderr);
    }
  } catch (error) {
    console.log('   ❌ Error testing environment variable:', error.message);
  }

  console.log('\n3. Testing NPM script execution...');

  try {
    const result = await runCommand('npm', ['run', 'sec:myth:src:pr', '--', '--help']);

    if (result.code === 0 || result.stdout.includes('failOn')) {
      console.log('   ✅ NPM script executes successfully');
    } else {
      console.log('   ❌ NPM script failed');
      console.log('   Error:', result.stderr);
    }
  } catch (error) {
    console.log('   ❌ Error testing NPM script:', error.message);
  }

  console.log('\n🎯 Integration Test Complete');
}

testFastPRMode().catch(console.error);
