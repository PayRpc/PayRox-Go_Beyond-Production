#!/usr/bin/env ts-node
/**
 * PayRox Splitter Demo
 * Demonstrates the complete contract splitting workflow
 */

import { PayRoxSplitterEngine } from './engine';

async function main() {
  console.log(`
🎯 PayRox Contract Splitter Demonstration
==========================================

This demo shows the complete workflow for splitting a large Solidity contract
into multiple facets for diamond pattern deployment.

Process Overview:
1. 📤 Upload & Analyze monolith contract
2. 🔧 Generate split plan with strategy selection
3. 📝 Generate facet artifacts (contracts, interfaces, storage)
4. 🔨 Compile and validate (gates: selector parity, EIP-170)
5. 🌳 Build ordered Merkle tree for verification
6. 📋 Create dispatcher plan for deployment
7. 🚀 Optional: Deploy facets and commit plan

Let's begin...
`);

  const engine = new PayRoxSplitterEngine();

  try {
    // Step 1: Upload and Analyze
    console.log('📤 STEP 1: Upload and Analyze');
    console.log('==============================');

    const analysis = await engine.upload(Buffer.from('mock contract'), 'PayRoxMonolith.sol');

    console.log(`✅ Contract analyzed: ${analysis.name}`);
    console.log(`   📊 Lines of code: ${analysis.linesOfCode.toLocaleString()}`);
    console.log(`   🔧 Functions: ${analysis.functions.length}`);
    console.log(`   📦 Estimated size: ${Math.round(analysis.estimatedSize / 1024)} KB`);
    console.log(`   ⚠️  EIP-170 risk: ${getRiskBadge(analysis.eip170Risk)}`);
    console.log(`   📜 License: ${analysis.spdxLicense || 'Not specified'}`);
    console.log(`   📚 Imports: ${analysis.imports.length} dependencies`);

    // Step 2: Generate Split Plans (demonstrate all strategies)
    console.log('\n🔧 STEP 2: Generate Split Plans');
    console.log('================================');

    const strategies = ['core-view-logic', 'domain-buckets', 'size-first'] as const;
    const plans = new Map();

    for (const strategy of strategies) {
      console.log(`\n🎯 Strategy: ${strategy}`);
      const plan = await engine.generateSplitPlan(analysis, strategy, 18);
      plans.set(strategy, plan);

      console.log(`   Facets generated: ${plan.facets.length}`);
      console.log(`   Total selectors: ${plan.totalSelectors}`);
      console.log(`   Estimated gas savings: ${plan.estimatedGasSavings.toLocaleString()}`);

      if (plan.collisions.length > 0) {
        console.log(`   ❌ Collisions: ${plan.collisions.length}`);
      } else {
        console.log(`   ✅ No selector collisions`);
      }

      // Show facet breakdown
      plan.facets.forEach(facet => {
        const sizeKB = Math.round(facet.estimatedRuntimeSize / 1024);
        const status = sizeKB > 24 ? '🔴' : sizeKB > 20 ? '🟡' : '🟢';
        console.log(`     ${status} ${facet.name}: ${facet.selectorCount} selectors, ~${sizeKB} KB${facet.isCore ? ' (core)' : ''}`);
      });
    }

    // Use the core-view-logic plan for remaining steps
    const selectedPlan = plans.get('core-view-logic')!;
    console.log(`\n✅ Selected strategy: core-view-logic (${selectedPlan.facets.length} facets)`);

    // Step 3: Generate Artifacts
    console.log('\n📝 STEP 3: Generate Artifacts');
    console.log('==============================');

    const artifacts = await engine.generateArtifacts(selectedPlan);
    console.log(`Generated ${artifacts.length} files:`);

    // Group by type
    const artifactsByType = new Map();
    artifacts.forEach(artifact => {
      if (!artifactsByType.has(artifact.type)) {
        artifactsByType.set(artifact.type, []);
      }
      artifactsByType.get(artifact.type).push(artifact);
    });

    artifactsByType.forEach((files, type) => {
      console.log(`\n   ${getTypeIcon(type)} ${type.toUpperCase()} (${files.length} files):`);
      files.forEach((file: any) => {
        const sizeKB = Math.round(file.size / 1024 * 100) / 100;
        console.log(`     📄 ${file.path} (${sizeKB} KB)`);
      });
    });

    // Show sample facet code
    const sampleFacet = artifacts.find(a => a.type === 'facet');
    if (sampleFacet) {
      console.log(`\n📄 Sample Facet Code (${sampleFacet.path}):`);
      console.log('```solidity');
      console.log(sampleFacet.content.split('\n').slice(0, 20).join('\n'));
      console.log('... (truncated)');
      console.log('```');
    }

    // Step 4: Compile and Validate
    console.log('\n🔨 STEP 4: Compile and Validate');
    console.log('=================================');

    // Mock successful compilation with realistic sizes that pass EIP-170
    const mockCompilation = {
      success: true,
      facetSizes: new Map<string, number>([
        ['CoreFacet', 18432],    // 18KB - well under 24KB limit
        ['ViewFacet', 15360],    // 15KB - well under 24KB limit
        ['LogicFacet', 16384]    // 16KB - well under 24KB limit
      ]),
      errors: [],
      warnings: ['Using experimental features'],
      buildHash: generateHash()
    };

    console.log(`✅ Compilation: ${mockCompilation.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Build hash: ${mockCompilation.buildHash}`);
    if (mockCompilation.warnings.length > 0) {
      console.log(`   ⚠️  Warnings: ${mockCompilation.warnings.length}`);
    }

    // Validate gates
    const gates = await engine.validateGates(analysis, mockCompilation);

    console.log('\n🚦 VALIDATION GATES:');

    // Selector parity gate
    const selectorStatus = gates.selector.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`   🎯 Selector Parity: ${selectorStatus}`);
    if (!gates.selector.passed) {
      if (gates.selector.missingFromFacets.length > 0) {
        console.log(`      Missing from facets: ${gates.selector.missingFromFacets.length}`);
      }
      if (gates.selector.extrasNotInMonolith.length > 0) {
        console.log(`      Extras not in monolith: ${gates.selector.extrasNotInMonolith.length}`);
      }
    }

    // EIP-170 gate
    const eip170Status = gates.eip170.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`   📦 EIP-170 Size Limit: ${eip170Status}`);

    console.log('\n   📊 Facet Sizes:');
    for (const [facetName, size] of mockCompilation.facetSizes) {
      const sizeKB = Math.round((size as number) / 1024);
      const status = (size as number) >= 24576 ? '🔴' : (size as number) >= 20480 ? '🟡' : '🟢';
      console.log(`     ${status} ${facetName}: ${sizeKB} KB (${(size as number).toLocaleString()} bytes)`);
    }

    // Step 5: Build Merkle Tree
    console.log('\n🌳 STEP 5: Build Ordered Merkle Tree');
    console.log('=====================================');

    const merkle = await engine.buildMerkleTree(mockCompilation, selectedPlan);

    console.log(`✅ Merkle tree built:`);
    console.log(`   🌳 Root: ${merkle.root}`);
    console.log(`   🍃 Leaves: ${merkle.leaves.length}`);
    console.log(`   📦 Packed proof size: ${Math.round(merkle.packedSize / 1024)} KB`);
    console.log(`   🔍 Per-selector proofs: ${merkle.proofs.size}`);

    // Show sample leaves
    console.log('\n   📋 Sample Merkle Leaves (first 3):');
    merkle.leaves.slice(0, 3).forEach((leaf, i) => {
      console.log(`     ${i + 1}. ${leaf.selector} → ${leaf.facet}`);
      console.log(`        Codehash: ${leaf.codehash.slice(0, 16)}...`);
      console.log(`        Leaf: ${leaf.leaf.slice(0, 16)}...`);
    });

    // Step 6: Create Dispatcher Plan
    console.log('\n📋 STEP 6: Create Dispatcher Plan');
    console.log('===================================');

    const delay = 86400; // 24 hours
    const dispatcherPlan = await engine.createDispatcherPlan(merkle, selectedPlan, delay);

    console.log(`✅ Dispatcher plan created:`);
    console.log(`   🎯 Selectors: ${dispatcherPlan.selectors.length}`);
    console.log(`   🏗️  Facets: ${dispatcherPlan.facets.length}`);
    console.log(`   🔗 Codehashes: ${dispatcherPlan.codehashes.length}`);
    console.log(`   ⏰ Delay: ${delay / 3600} hours`);
    console.log(`   📅 ETA: ${new Date(dispatcherPlan.eta * 1000).toISOString()}`);
    console.log(`   🌳 Merkle root: ${dispatcherPlan.merkleRoot}`);
    console.log(`   🔨 Build hash: ${dispatcherPlan.buildHash}`);

    // Calculate overall validation status for summary
    const overallValidation = gates.selector.passed && gates.eip170.passed;

    // Step 7: Summary and Next Steps
    console.log('\n✅ WORKFLOW COMPLETED SUCCESSFULLY!');
    console.log('====================================');

    console.log(`
📊 SPLITTING SUMMARY:
• Original contract: ${analysis.name} (~${Math.round(analysis.estimatedSize / 1024)} KB)
• Generated facets: ${selectedPlan.facets.length}
• Total selectors: ${selectedPlan.totalSelectors}
• Estimated gas savings: ${selectedPlan.estimatedGasSavings.toLocaleString()}
• All validation gates: ${overallValidation ? 'PASSED ✅' : 'FAILED ❌'}
• Deployment ready: ${overallValidation ? 'YES 🚀' : 'NO ⚠️ (Fix validation errors first)'}

📦 GENERATED ARTIFACTS:
• ${artifacts.filter(a => a.type === 'facet').length} Facet contracts
• ${artifacts.filter(a => a.type === 'interface').length} Interface files
• ${artifacts.filter(a => a.type === 'storage').length} Storage libraries
• ${artifacts.filter(a => a.type === 'manifest').length} Manifest files
• Merkle tree with ${merkle.leaves.length} leaves
• Dispatcher plan (ETA: ${new Date(dispatcherPlan.eta * 1000).toLocaleDateString()})

🚀 NEXT STEPS:
${overallValidation ? `1. Deploy facets using CREATE2 factory
2. Verify deployed codehashes match predictions
3. Commit dispatcher plan (respecting governance delay)
4. Apply plan after delay expires
5. Update client code to use new facet addresses` : `1. 🔧 Fix validation failures:
   ${!gates.selector.passed ? '  - Implement proper selector extraction from compiled facets' : ''}
   ${!gates.eip170.passed ? '  - Check runtime bytecode sizes (not creation bytecode)' : ''}
2. Re-run validation after fixes
3. Deploy only after all gates pass`}

🔗 INTEGRATION COMMANDS:
   # Validate split contracts
   npx ts-node tools/splitter/scripts/checkParity.ts
   npx ts-node tools/splitter/scripts/checkSizes.ts

   # Build real Merkle tree
   npx ts-node tools/splitter/scripts/buildMerkle.ts predictive

   # Compile facets
   npx hardhat compile

   # Deploy facets (only if validation passes)
   npx hardhat run scripts/deploy-facets.ts

   # Commit plan
   npx hardhat run scripts/commit-plan.ts

   # Apply plan (after delay)
   npx hardhat run scripts/apply-plan.ts

💡 The splitter has demonstrated the complete workflow for
   converting a monolithic contract into a diamond pattern architecture!
   ${overallValidation ? 'All systems ready for deployment! 🎯' : 'Fix validation issues before proceeding. 🔧'}
`);

  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

function getRiskBadge(risk: 'safe' | 'warning' | 'critical'): string {
  const badges = {
    safe: '🟢 Safe (<20KB)',
    warning: '🟡 Warning (20-23KB)',
    critical: '🔴 Critical (>23KB - split required)'
  };
  return badges[risk];
}

function getTypeIcon(type: string): string {
  const icons = {
    facet: '🏗️',
    interface: '📝',
    storage: '💾',
    manifest: '📋',
    script: '🤖'
  };
  return icons[type as keyof typeof icons] || '📄';
}

function generateHash(): string {
  return Math.random().toString(36).substring(2, 18);
}

if (require.main === module) {
  main().catch(console.error);
}
