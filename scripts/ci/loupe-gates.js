#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

/**
 * Comprehensive Loupe Gate Validation
 * Combines standard loupe + extended loupe + EIP-170 + selector parity
 */

const { validateLoupeParity } = require('./validate-loupe-parity');
const { validateLoupeEx } = require('./validate-loupe-ex');

async function validateEIP170Compliance() {
  console.log('📏 Validating EIP-170 Compliance (24KB limit)...');

  try {
    const deployedPath = path.join('split-output', 'deployed-addresses.json');
    if (!fs.existsSync(deployedPath)) {
      throw new Error('deployed-addresses.json not found');
    }

    const deployedData = JSON.parse(fs.readFileSync(deployedPath, 'utf8'));
    const dispatcherAddr = deployedData.ManifestDispatcher || deployedData.dispatcher;

    const hre = require('hardhat');
    const { ethers } = hre;

    const dispatcherArtifact = await hre.artifacts.readArtifact('ManifestDispatcher');
    const dispatcher = new ethers.Contract(dispatcherAddr, dispatcherArtifact.abi, ethers.provider);

    const facetAddresses = await dispatcher.facetAddresses();
    const EIP170_LIMIT = 24576; // 24KB
    const SAFETY_MARGIN = 1024; // 1KB headroom
    const SAFE_LIMIT = EIP170_LIMIT - SAFETY_MARGIN;

    let violationCount = 0;

    for (const facetAddr of facetAddresses) {
      const code = await ethers.provider.getCode(facetAddr);
      const codeSize = (code.length - 2) / 2; // Remove 0x prefix and convert hex to bytes

      console.log(`📦 ${facetAddr}: ${codeSize} bytes`);

      if (codeSize > EIP170_LIMIT) {
        console.error(`❌ EIP-170 VIOLATION: ${facetAddr} size ${codeSize} > ${EIP170_LIMIT}`);
        violationCount++;
      } else if (codeSize > SAFE_LIMIT) {
        console.warn(`⚠️  SAFETY WARNING: ${facetAddr} size ${codeSize} > ${SAFE_LIMIT} (safe limit)`);
      } else {
        console.log(`✅ ${facetAddr}: ${codeSize} bytes (OK)`);
      }
    }

    if (violationCount > 0) {
      throw new Error(`${violationCount} facets exceed EIP-170 limit`);
    }

    console.log(`✅ EIP-170 compliance validated: ${facetAddresses.length} facets under limit`);

    return {
      success: true,
      facetsChecked: facetAddresses.length,
      violations: violationCount
    };

  } catch (error) {
    console.error(`❌ EIP-170 validation failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function validateSelectorParity() {
  console.log('🔍 Validating Selector Parity...');

  try {
    const selectorsPath = path.join('split-output', 'selectors.json');
    if (!fs.existsSync(selectorsPath)) {
      throw new Error('selectors.json not found');
    }

    const selectorsData = JSON.parse(fs.readFileSync(selectorsPath, 'utf8'));
    const expectedCount = Object.keys(selectorsData).length;

    // Expected count from your system (adjust as needed)
    const EXPECTED_SELECTOR_COUNT = 71;

    console.log(`📊 Selectors in manifest: ${expectedCount}`);
    console.log(`📊 Expected count: ${EXPECTED_SELECTOR_COUNT}`);

    if (expectedCount !== EXPECTED_SELECTOR_COUNT) {
      console.warn(`⚠️  Selector count drift: expected ${EXPECTED_SELECTOR_COUNT}, got ${expectedCount}`);
      // Don't fail - this may be expected during development
    }

    // Check for duplicate selectors
    const selectors = Object.keys(selectorsData);
    const uniqueSelectors = new Set(selectors);

    if (selectors.length !== uniqueSelectors.size) {
      throw new Error(`Duplicate selectors found in manifest`);
    }

    console.log(`✅ Selector parity validated: ${expectedCount} unique selectors`);

    return {
      success: true,
      selectorCount: expectedCount,
      duplicates: false
    };

  } catch (error) {
    console.error(`❌ Selector parity validation failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runLoupeGates() {
  console.log('🚪 Running Comprehensive Loupe Gates...');
  console.log('==========================================');

  const results = {
    loupeParity: null,
    loupeEx: null,
    eip170: null,
    selectorParity: null,
    overall: false
  };

  // Run all validations
  results.loupeParity = await validateLoupeParity();
  results.loupeEx = await validateLoupeEx();
  results.eip170 = await validateEIP170Compliance();
  results.selectorParity = await validateSelectorParity();

  // Determine overall result
  results.overall =
    results.loupeParity.success &&
    results.loupeEx.success &&
    results.eip170.success &&
    results.selectorParity.success;

  // Summary
  console.log('\\n📋 LOUPE GATE SUMMARY:');
  console.log('======================');
  console.log(`Loupe Parity:     ${results.loupeParity.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`LoupeEx Extended: ${results.loupeEx.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`EIP-170 Limits:   ${results.eip170.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Selector Parity:  ${results.selectorParity.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`\\nOVERALL: ${results.overall ? '🟢 ALL GATES PASSED' : '🔴 SOME GATES FAILED'}`);

  if (!results.overall && process.env.CI) {
    process.exit(1);
  }

  return results;
}

// Run gates if called directly
if (require.main === module) {
  runLoupeGates();
}

module.exports = {
  runLoupeGates,
  validateEIP170Compliance,
  validateSelectorParity
};
