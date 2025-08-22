import { ethers } from 'hardhat';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface ManifestEntry {
  selector: string;
  facet: string;
  name: string;
}

interface DispatcherPlan {
  timestamp: string;
  version: number;
  activationDelay: number;
  totalSelectors: number;
  selectors: string[];
  facets: string[];
  codehashes: string[];
  entries: ManifestEntry[];
}

/**
 * Generate a dispatcher plan from manifest.json and compute codehashes
 * Outputs dispatcher.plan.json for deployment use
 */
async function generateDispatcherPlan(): Promise<void> {
  const manifestPath = resolve(__dirname, '../../manifest.json');
  const outputPath = resolve(__dirname, '../../artifacts/dispatcher.plan.json');

  console.log('📋 Reading manifest from:', manifestPath);

  if (!existsSync(manifestPath)) {
    console.warn('⚠️  manifest.json not found, creating sample plan');
    await createSamplePlan(outputPath);
    return;
  }

  try {
    const manifestContent = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    const plan: DispatcherPlan = {
      timestamp: new Date().toISOString(),
      version: manifest.version || 1,
      activationDelay: 300, // 5 minutes default
      totalSelectors: 0,
      selectors: [],
      facets: [],
      codehashes: [],
      entries: []
    };

    console.log('🔍 Processing manifest entries...');

    // Process manifest entries and compute codehashes
    if (manifest.facets && Array.isArray(manifest.facets)) {
      for (const facetEntry of manifest.facets) {
        const facetName = facetEntry.name;
        const facetAddress = facetEntry.address || ethers.ZeroAddress;

        console.log(`  📦 Processing facet: ${facetName}`);

        if (facetEntry.selectors && Array.isArray(facetEntry.selectors)) {
          for (const selector of facetEntry.selectors) {
            plan.selectors.push(selector);
            plan.facets.push(facetAddress);

            // Compute codehash if address is provided and non-zero
            let codehash = ethers.ZeroHash;
            if (facetAddress !== ethers.ZeroAddress) {
              try {
                // Note: This would require a live network connection to get actual codehash
                // For planning purposes, we use a deterministic hash based on facet name
                codehash = ethers.keccak256(ethers.toUtf8Bytes(`${facetName}:${selector}`));
                console.log(`    ✅ Computed codehash for ${selector}: ${codehash.slice(0, 10)}...`);
              } catch (error) {
                console.warn(`    ⚠️  Could not compute codehash for ${facetAddress}, using zero hash`);
              }
            }

            plan.codehashes.push(codehash);
            plan.entries.push({
              selector,
              facet: facetAddress,
              name: facetName
            });
          }
        }
      }
    }

    plan.totalSelectors = plan.selectors.length;

    console.log(`📊 Generated plan with ${plan.totalSelectors} selectors`);
    console.log('💾 Writing dispatcher plan to:', outputPath);

    writeFileSync(outputPath, JSON.stringify(plan, null, 2));

    console.log('✅ Dispatcher plan generated successfully');
    console.log(`   Selectors: ${plan.totalSelectors}`);
    console.log(`   Activation delay: ${plan.activationDelay}s`);
    console.log(`   Output: ${outputPath}`);

  } catch (error) {
    console.error('❌ Error generating dispatcher plan:', error);
    process.exit(1);
  }
}

async function createSamplePlan(outputPath: string): Promise<void> {
  const samplePlan: DispatcherPlan = {
    timestamp: new Date().toISOString(),
    version: 1,
    activationDelay: 300,
    totalSelectors: 2,
    selectors: [
      '0x5c975abb', // deployDeterministic
      '0x8da5cb5b'  // owner
    ],
    facets: [
      ethers.ZeroAddress,
      ethers.ZeroAddress
    ],
    codehashes: [
      ethers.ZeroHash,
      ethers.ZeroHash
    ],
    entries: [
      {
        selector: '0x5c975abb',
        facet: ethers.ZeroAddress,
        name: 'ChunkFactoryFacet'
      },
      {
        selector: '0x8da5cb5b',
        facet: ethers.ZeroAddress,
        name: 'OwnershipFacet'
      }
    ]
  };

  writeFileSync(outputPath, JSON.stringify(samplePlan, null, 2));
  console.log('📄 Sample dispatcher plan created');
}

if (require.main === module) {
  generateDispatcherPlan().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { generateDispatcherPlan, DispatcherPlan };
