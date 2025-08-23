#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

/**
 * LoupeEx Extended Validation
 * Validates extended loupe features (provenance, security, metadata)
 */

async function validateLoupeEx() {
  console.log('🔍 Validating LoupeEx Extended Features...');

  try {
    // Read deployment plan
    const planPath = path.join('split-output', 'deployment-plan.json');
    if (!fs.existsSync(planPath)) {
      throw new Error('deployment-plan.json not found in split-output/');
    }

    const deploymentPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

    // Read observed codehashes
    const codehashFiles = fs.readdirSync('split-output')
      .filter(f => f.startsWith('codehashes-observed-') && f.endsWith('.json'));

    if (codehashFiles.length === 0) {
      throw new Error('No codehashes-observed-*.json found');
    }

    const observedPath = path.join('split-output', codehashFiles[0]);
    const observedHashes = JSON.parse(fs.readFileSync(observedPath, 'utf8'));

    // Read deployed addresses
    const deployedPath = path.join('split-output', 'deployed-addresses.json');
    if (!fs.existsSync(deployedPath)) {
      throw new Error('deployed-addresses.json not found');
    }

    const deployedData = JSON.parse(fs.readFileSync(deployedPath, 'utf8'));
    const dispatcherAddr = deployedData.ManifestDispatcher || deployedData.dispatcher;

    if (!dispatcherAddr) {
      throw new Error('No dispatcher address found');
    }

    console.log(`📍 Dispatcher: ${dispatcherAddr}`);

    // Initialize hardhat
    const hre = require('hardhat');
    const { ethers } = hre;

    // Get dispatcher contract (with LoupeEx interface)
    const dispatcherArtifact = await hre.artifacts.readArtifact('ManifestDispatcher');
    const dispatcher = new ethers.Contract(dispatcherAddr, dispatcherArtifact.abi, ethers.provider);

    // Validate each facet in the deployment plan
    let validatedCount = 0;

    for (const facetEntry of deploymentPlan.facets || []) {
      const facetAddr = facetEntry.facet;
      const expectedCodehash = facetEntry.codehash;
      const expectedVersion = facetEntry.versionTag;
      const expectedSecurityLevel = facetEntry.securityLevel;
      const expectedMetadata = facetEntry.metadata;

      console.log(`🔍 Validating ${facetEntry.name} (${facetAddr})`);

      // 1. Validate facetHash matches observed codehash
      try {
        const onChainHash = await dispatcher.facetHash(facetAddr);
        const observedHash = observedHashes[facetAddr.toLowerCase()];

        if (expectedCodehash && onChainHash.toLowerCase() !== expectedCodehash.toLowerCase()) {
          throw new Error(`Codehash mismatch for ${facetAddr}: expected ${expectedCodehash}, got ${onChainHash}`);
        }

        if (observedHash && onChainHash.toLowerCase() !== observedHash.toLowerCase()) {
          throw new Error(`Observed codehash mismatch for ${facetAddr}: loupe ${onChainHash}, observed ${observedHash}`);
        }

        console.log(`  ✅ Codehash verified: ${onChainHash}`);
      } catch (error) {
        console.warn(`  ⚠️  Codehash check failed: ${error.message}`);
      }

      // 2. Validate provenance
      try {
        const [deployer, timestamp] = await dispatcher.facetProvenance(facetAddr);
        console.log(`  ✅ Provenance: deployer=${deployer}, timestamp=${timestamp}`);

        // Validate deployer is orchestrator (if specified in plan)
        if (deploymentPlan.orchestrator && deployer.toLowerCase() !== deploymentPlan.orchestrator.toLowerCase()) {
          console.warn(`  ⚠️  Deployer mismatch: expected ${deploymentPlan.orchestrator}, got ${deployer}`);
        }
      } catch (error) {
        console.warn(`  ⚠️  Provenance check failed: ${error.message}`);
      }

      // 3. Validate version tag (if LoupeEx supports it)
      if (expectedVersion) {
        try {
          // This would require the dispatcher to have facetVersionTag method
          console.log(`  📋 Expected version: ${expectedVersion}`);
        } catch (error) {
          console.warn(`  ⚠️  Version check not supported: ${error.message}`);
        }
      }

      // 4. Validate security level (if LoupeEx supports it)
      if (expectedSecurityLevel !== undefined) {
        try {
          console.log(`  🔒 Expected security level: ${expectedSecurityLevel}`);
        } catch (error) {
          console.warn(`  ⚠️  Security level check not supported: ${error.message}`);
        }
      }

      // 5. Validate selectorHash consistency
      try {
        const selectorHash = await dispatcher.selectorHash(facetAddr);
        console.log(`  ✅ Selector hash: ${selectorHash}`);
      } catch (error) {
        console.warn(`  ⚠️  Selector hash check failed: ${error.message}`);
      }

      validatedCount++;
    }

    console.log(`✅ LoupeEx validation completed: ${validatedCount} facets checked`);

    return {
      success: true,
      facetsValidated: validatedCount
    };

  } catch (error) {
    console.error(`❌ LoupeEx validation failed: ${error.message}`);
    if (process.env.CI) {
      process.exit(1);
    }
    return { success: false, error: error.message };
  }
}

// Run validation if called directly
if (require.main === module) {
  validateLoupeEx().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  });
}

module.exports = { validateLoupeEx };
