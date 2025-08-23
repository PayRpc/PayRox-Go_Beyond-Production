#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

/**
 * Loupe Parity Validation
 * Ensures loupe interface returns match selectors.json truth
 */

async function validateLoupeParity() {
  console.log('🔍 Validating Loupe Parity...');

  try {
    // Read selectors.json (ground truth)
    const selectorsPath = path.join('split-output', 'selectors.json');
    if (!fs.existsSync(selectorsPath)) {
      throw new Error('selectors.json not found in split-output/');
    }

    const selectorsData = JSON.parse(fs.readFileSync(selectorsPath, 'utf8'));

    // Read deployment addresses
    const deployedPath = path.join('split-output', 'deployed-addresses.json');
    if (!fs.existsSync(deployedPath)) {
      throw new Error('deployed-addresses.json not found');
    }

    const deployedData = JSON.parse(fs.readFileSync(deployedPath, 'utf8'));
    const dispatcherAddr = deployedData.ManifestDispatcher || deployedData.dispatcher;

    if (!dispatcherAddr) {
      throw new Error('No dispatcher address found in deployed-addresses.json');
    }

    console.log(`📍 Dispatcher: ${dispatcherAddr}`);

    // Initialize hardhat for contract calls
    const hre = require('hardhat');
    const { ethers } = hre;

    // Get dispatcher contract
    const dispatcherArtifact = await hre.artifacts.readArtifact('ManifestDispatcher');
    const dispatcher = new ethers.Contract(dispatcherAddr, dispatcherArtifact.abi, ethers.provider);

    // Query loupe data
    console.log('📋 Querying facetAddresses()...');
    const loupeAddresses = await dispatcher.facetAddresses();

    console.log('📋 Querying facets()...');
    const loupeFacets = await dispatcher.facets();

    // Build expected data from selectors.json
    const expectedFacets = new Map();
    const expectedSelectors = new Set();

    for (const [selector, route] of Object.entries(selectorsData)) {
      const facetAddr = route.facet;
      expectedSelectors.add(selector);

      if (!expectedFacets.has(facetAddr)) {
        expectedFacets.set(facetAddr, []);
      }
      expectedFacets.get(facetAddr).push(selector);
    }

    // Validate facet addresses
    const expectedAddresses = Array.from(expectedFacets.keys()).sort();
    const actualAddresses = loupeAddresses.map(addr => addr.toLowerCase()).sort();

    console.log(`📊 Expected facets: ${expectedAddresses.length}`);
    console.log(`📊 Loupe facets: ${actualAddresses.length}`);

    if (expectedAddresses.length !== actualAddresses.length) {
      throw new Error(`Facet count mismatch: expected ${expectedAddresses.length}, got ${actualAddresses.length}`);
    }

    for (let i = 0; i < expectedAddresses.length; i++) {
      if (expectedAddresses[i].toLowerCase() !== actualAddresses[i]) {
        throw new Error(`Facet address mismatch at index ${i}: expected ${expectedAddresses[i]}, got ${actualAddresses[i]}`);
      }
    }

    // Validate selectors per facet
    let totalSelectorsValidated = 0;

    for (const loupeFacet of loupeFacets) {
      const facetAddr = loupeFacet.facetAddress.toLowerCase();
      const expectedSelectorsForFacet = expectedFacets.get(facetAddr) || [];
      const actualSelectorsForFacet = loupeFacet.functionSelectors;

      console.log(`🔍 Validating ${facetAddr}: ${expectedSelectorsForFacet.length} selectors`);

      if (expectedSelectorsForFacet.length !== actualSelectorsForFacet.length) {
        throw new Error(`Selector count mismatch for ${facetAddr}: expected ${expectedSelectorsForFacet.length}, got ${actualSelectorsForFacet.length}`);
      }

      const expectedSet = new Set(expectedSelectorsForFacet.map(s => s.toLowerCase()));
      const actualSet = new Set(actualSelectorsForFacet.map(s => s.toLowerCase()));

      for (const expectedSel of expectedSet) {
        if (!actualSet.has(expectedSel)) {
          throw new Error(`Missing selector ${expectedSel} for facet ${facetAddr}`);
        }
      }

      for (const actualSel of actualSet) {
        if (!expectedSet.has(actualSel)) {
          throw new Error(`Unexpected selector ${actualSel} for facet ${facetAddr}`);
        }
      }

      totalSelectorsValidated += actualSelectorsForFacet.length;
    }

    console.log(`✅ Loupe parity validated: ${expectedFacets.size} facets, ${totalSelectorsValidated} selectors`);

    return {
      success: true,
      facetsValidated: expectedFacets.size,
      selectorsValidated: totalSelectorsValidated
    };

  } catch (error) {
    console.error(`❌ Loupe parity validation failed: ${error.message}`);
    if (process.env.CI) {
      process.exit(1);
    }
    return { success: false, error: error.message };
  }
}

// Run validation if called directly
if (require.main === module) {
  validateLoupeParity().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  });
}

module.exports = { validateLoupeParity };
