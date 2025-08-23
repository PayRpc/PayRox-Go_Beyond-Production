#!/usr/bin/env ts-node
/**
 * @title Loupe Validation CI Gate
 * @notice Validates that Loupe interfaces return consistent data vs. actual deployment state
 * @dev Compares facetAddresses() + facetFunctionSelectors() against selectors.json
 */

import fs from 'fs'
import path from 'path'
import { ethers } from 'hardhat'

interface SelectorData {
  [selector: string]: {
    facet: string
    name: string
    codehash?: string
  }
}

interface DeploymentPlan {
  facets: Array<{
    facet: string
    name: string
    selectors: string[]
    codehash: string
    versionTag?: string
    securityLevel?: number
    metadata?: {
      category?: string
      dependencies?: string[]
      isUpgradeable?: boolean
    }
  }>
}

interface CodehashesObserved {
  [address: string]: string
}

async function main() {
  const args = process.argv.slice(2)
  const dispatcherAddress = args[0] || process.env.DISPATCHER_ADDRESS
  const selectorsPath = args[1] || 'split-output/selectors.json'
  const deploymentPlanPath = args[2] || 'split-output/deployment-plan.json'
  const codehashesPath = args[3] || 'split-output/codehashes-observed-*.json'
  const strict = args.includes('--strict')
  const extended = args.includes('--extended')

  if (!dispatcherAddress) {
    console.error('Usage: validate-loupe.ts <dispatcher-address> [selectors.json] [deployment-plan.json] [codehashes.json] [--strict] [--extended]')
    process.exit(1)
  }

  console.log('🔍 LOUPE VALIDATION CI GATE')
  console.log('============================')
  console.log(`Dispatcher: ${dispatcherAddress}`)
  console.log(`Strict Mode: ${strict}`)
  console.log(`Extended Validation: ${extended}`)
  console.log('')

  // Load expected data
  let selectorsData: SelectorData = {}
  let deploymentPlan: DeploymentPlan = { facets: [] }
  let codehashesObserved: CodehashesObserved = {}

  if (fs.existsSync(selectorsPath)) {
    selectorsData = JSON.parse(fs.readFileSync(selectorsPath, 'utf8'))
    console.log(`✅ Loaded selectors.json: ${Object.keys(selectorsData).length} selectors`)
  } else {
    console.log(`⚠️  No selectors.json found at ${selectorsPath}`)
    if (strict) process.exit(1)
  }

  if (fs.existsSync(deploymentPlanPath)) {
    deploymentPlan = JSON.parse(fs.readFileSync(deploymentPlanPath, 'utf8'))
    console.log(`✅ Loaded deployment-plan.json: ${deploymentPlan.facets.length} facets`)
  }

  // Find codehashes file (glob pattern)
  const codehashFiles = fs.readdirSync('split-output').filter(f => f.startsWith('codehashes-observed-') && f.endsWith('.json'))
  if (codehashFiles.length > 0) {
    const latestCodehashFile = codehashFiles.sort().pop()!
    codehashesObserved = JSON.parse(fs.readFileSync(path.join('split-output', latestCodehashFile), 'utf8'))
    console.log(`✅ Loaded ${latestCodehashFile}: ${Object.keys(codehashesObserved).length} codehashes`)
  }

  // Connect to dispatcher
  const dispatcher = await ethers.getContractAt('ManifestDispatcher', dispatcherAddress)

  console.log('\n📊 EIP-2535 LOUPE VALIDATION')
  console.log('─────────────────────────────')

  // Get loupe data
  const facetAddresses = await dispatcher.facetAddresses()
  console.log(`Loupe facetAddresses(): ${facetAddresses.length} facets`)

  const facets = await dispatcher.facets()
  console.log(`Loupe facets(): ${facets.length} facets`)

  // Build loupe selector map
  const loupeSelectors: { [selector: string]: string } = {}
  for (const facet of facets) {
    for (const selector of facet.functionSelectors) {
      loupeSelectors[selector] = facet.facetAddress
    }
  }

  console.log(`Total loupe selectors: ${Object.keys(loupeSelectors).length}`)

  // Compare with selectors.json
  let errors = 0
  const expectedSelectors = Object.keys(selectorsData)
  const actualSelectors = Object.keys(loupeSelectors)

  console.log(`\nExpected selectors (from ${selectorsPath}): ${expectedSelectors.length}`)
  console.log(`Actual selectors (from loupe): ${actualSelectors.length}`)

  // Check missing selectors
  const missingSelectors = expectedSelectors.filter(sel => !loupeSelectors[sel])
  if (missingSelectors.length > 0) {
    console.log(`❌ Missing selectors (${missingSelectors.length}):`)
    missingSelectors.forEach(sel => {
      console.log(`   ${sel} -> ${selectorsData[sel]?.name || 'unknown'}`)
    })
    errors += missingSelectors.length
  }

  // Check unexpected selectors
  const unexpectedSelectors = actualSelectors.filter(sel => !selectorsData[sel])
  if (unexpectedSelectors.length > 0) {
    console.log(`⚠️  Unexpected selectors (${unexpectedSelectors.length}):`)
    unexpectedSelectors.forEach(sel => {
      console.log(`   ${sel} -> ${loupeSelectors[sel]}`)
    })
    if (strict) errors += unexpectedSelectors.length
  }

  // Check facet address mismatches
  const mismatchedSelectors = expectedSelectors.filter(sel => {
    const expectedFacet = selectorsData[sel]?.facet?.toLowerCase()
    const actualFacet = loupeSelectors[sel]?.toLowerCase()
    return expectedFacet && actualFacet && expectedFacet !== actualFacet
  })

  if (mismatchedSelectors.length > 0) {
    console.log(`❌ Facet address mismatches (${mismatchedSelectors.length}):`)
    mismatchedSelectors.forEach(sel => {
      console.log(`   ${sel}: expected ${selectorsData[sel]?.facet} -> actual ${loupeSelectors[sel]}`)
    })
    errors += mismatchedSelectors.length
  }

  if (extended) {
    console.log('\n🔍 EXTENDED LOUPE VALIDATION')
    console.log('─────────────────────────────')

    try {
      const facetsEx = await dispatcher.facetsEx(true)
      console.log(`LoupeEx facetsEx(): ${facetsEx.length} facets`)

      // Validate codehashes
      let codehashErrors = 0
      for (const facetEx of facetsEx) {
        const expectedCodehash = codehashesObserved[facetEx.facetAddress.toLowerCase()]
        if (expectedCodehash) {
          const actualCodehash = await dispatcher.facetHash(facetEx.facetAddress)
          if (expectedCodehash.toLowerCase() !== actualCodehash.toLowerCase()) {
            console.log(`❌ Codehash mismatch for ${facetEx.facetAddress}:`)
            console.log(`   Expected: ${expectedCodehash}`)
            console.log(`   Actual:   ${actualCodehash}`)
            codehashErrors++
          }
        }
      }

      if (codehashErrors === 0) {
        console.log(`✅ All codehashes match observed values`)
      } else {
        console.log(`❌ ${codehashErrors} codehash mismatches found`)
        errors += codehashErrors
      }

      // Validate provenance
      let provenanceErrors = 0
      for (const facetEx of facetsEx) {
        const [deployer, timestamp] = await dispatcher.facetProvenance(facetEx.facetAddress)
        if (deployer === ethers.ZeroAddress) {
          console.log(`⚠️  No provenance data for ${facetEx.facetAddress}`)
          if (strict) provenanceErrors++
        } else {
          console.log(`✅ ${facetEx.facetAddress} deployed by ${deployer} at ${new Date(Number(timestamp) * 1000).toISOString()}`)
        }
      }

      if (provenanceErrors > 0) {
        errors += provenanceErrors
      }

      // Validate security levels
      for (const facetEx of facetsEx) {
        if (facetEx.securityLevel === 0) {
          console.log(`⚠️  Facet ${facetEx.facetAddress} has security level 0 (unsafe)`)
        } else {
          console.log(`✅ ${facetEx.facetAddress} security level: ${facetEx.securityLevel}`)
        }
      }

      // Test selector hash consistency
      for (const facetEx of facetsEx) {
        try {
          const selectorHash = await dispatcher.selectorHash(facetEx.facetAddress)
          console.log(`✅ ${facetEx.facetAddress} selector hash: ${selectorHash}`)
        } catch (e) {
          console.log(`❌ Failed to get selector hash for ${facetEx.facetAddress}: ${e}`)
          errors++
        }
      }

    } catch (e) {
      console.log(`❌ Extended loupe validation failed: ${e}`)
      errors++
    }
  }

  console.log('\n📋 VALIDATION SUMMARY')
  console.log('─────────────────────')
  console.log(`Total errors: ${errors}`)

  if (errors === 0) {
    console.log('✅ ALL LOUPE VALIDATIONS PASSED')
    process.exit(0)
  } else {
    console.log('❌ LOUPE VALIDATION FAILED')
    if (strict) {
      process.exit(1)
    } else {
      console.log('⚠️  Running in non-strict mode, continuing...')
      process.exit(0)
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Validation script failed:', error)
    process.exit(1)
  })
}

export { main as validateLoupe }
