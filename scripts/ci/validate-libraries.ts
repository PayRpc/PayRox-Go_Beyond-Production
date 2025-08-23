#!/usr/bin/env ts-node
/**
 * @title Library Classification Tool
 * @notice Identifies and validates that support libraries remain as libraries
 * @dev Ensures OrderedMerkle, storage helpers, and utilities stay internal-only
 */

import fs from 'fs'
import path from 'path'

interface LibraryInfo {
  path: string
  name: string
  isLibrary: boolean
  hasSelectors: boolean
  purpose: 'storage' | 'utility' | 'unknown'
  shouldStayLibrary: boolean
}

async function main() {
  const contractsDir = 'contracts'
  const strict = process.argv.includes('--strict')

  console.log('📚 LIBRARY CLASSIFICATION VALIDATION')
  console.log('====================================')
  console.log(`Strict Mode: ${strict}\n`)

  const libraries: LibraryInfo[] = []

  // Known libraries that must stay as libraries
  const knownLibraries = [
    'OrderedMerkle',
    'ManifestDispatcherLib',
    'RefactorSafetyLib',
    'PayRoxAccessControlStorage',
    'PayRoxPauseStorage',
    'CustomerStorage',
    // Add other storage helpers
  ]

  // Find all .sol files
  function findSolFiles(dir: string): string[] {
    const files: string[] = []
    const entries = fs.readdirSync(dir)

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        files.push(...findSolFiles(fullPath))
      } else if (entry.endsWith('.sol')) {
        files.push(fullPath)
      }
    }

    return files
  }

  const solFiles = findSolFiles(contractsDir)
  console.log(`Found ${solFiles.length} Solidity files`)

  for (const filePath of solFiles) {
    const content = fs.readFileSync(filePath, 'utf8')
    const fileName = path.basename(filePath, '.sol')

    // Check if it's declared as a library
    const isLibrary = /\\blibrary\\s+\\w+/.test(content)

    // Check if it has function selectors (external/public functions)
    const hasExternalFunctions = /function\\s+\\w+\\s*\\([^)]*\\)\\s+external/.test(content)
    const hasPublicFunctions = /function\\s+\\w+\\s*\\([^)]*\\)\\s+public/.test(content)
    const hasSelectors = hasExternalFunctions || hasPublicFunctions

    // Determine purpose
    let purpose: 'storage' | 'utility' | 'unknown' = 'unknown'
    if (fileName.includes('Storage') || content.includes('bytes32 internal constant SLOT')) {
      purpose = 'storage'
    } else if (fileName.includes('Lib') || fileName.includes('Merkle') || fileName.includes('Util')) {
      purpose = 'utility'
    }

    // Should it stay a library?
    const shouldStayLibrary = knownLibraries.includes(fileName) ||
                              purpose === 'storage' ||
                              purpose === 'utility'

    libraries.push({
      path: filePath,
      name: fileName,
      isLibrary,
      hasSelectors,
      purpose,
      shouldStayLibrary
    })
  }

  // Report libraries
  console.log('\\n📋 LIBRARY STATUS REPORT')
  console.log('─────────────────────────')

  const correctLibraries = libraries.filter(lib => lib.isLibrary && lib.shouldStayLibrary)
  const incorrectContracts = libraries.filter(lib => !lib.isLibrary && lib.shouldStayLibrary)
  const facetsWithSelectors = libraries.filter(lib => !lib.shouldStayLibrary && lib.hasSelectors)

  console.log(`\\n✅ CORRECT LIBRARIES (${correctLibraries.length}):`)
  correctLibraries.forEach(lib => {
    console.log(`   📚 ${lib.name} (${lib.purpose}) - ${lib.path}`)
  })

  if (incorrectContracts.length > 0) {
    console.log(`\\n❌ SHOULD BE LIBRARIES (${incorrectContracts.length}):`)
    incorrectContracts.forEach(lib => {
      console.log(`   ⚠️  ${lib.name} (${lib.purpose}) - should be 'library' not 'contract'`)
      console.log(`       Path: ${lib.path}`)
    })
  }

  console.log(`\\n🔧 PROPER FACETS (${facetsWithSelectors.length}):`)
  facetsWithSelectors.forEach(lib => {
    console.log(`   💎 ${lib.name} - has selectors, correctly implemented as facet`)
  })

  // Validate specific known libraries
  console.log('\\n🎯 SPECIFIC LIBRARY VALIDATION')
  console.log('──────────────────────────────')

  const orderedMerkleLib = libraries.find(lib => lib.name === 'OrderedMerkle')
  if (orderedMerkleLib) {
    if (orderedMerkleLib.isLibrary && !orderedMerkleLib.hasSelectors) {
      console.log('✅ OrderedMerkle: Correctly implemented as internal library')
    } else {
      console.log('❌ OrderedMerkle: Should be library with only internal functions')
    }
  } else {
    console.log('⚠️  OrderedMerkle: Not found')
  }

  const storageLibs = libraries.filter(lib => lib.purpose === 'storage')
  console.log(`\\n📦 Storage Libraries (${storageLibs.length}):`)
  storageLibs.forEach(lib => {
    const status = lib.isLibrary ? '✅' : '❌'
    console.log(`   ${status} ${lib.name} - ${lib.isLibrary ? 'library' : 'contract'}`)
  })

  // Count errors
  let errors = 0
  if (incorrectContracts.length > 0) {
    errors += incorrectContracts.length
  }

  // Check for libraries that shouldn't have selectors
  const librariesWithSelectors = libraries.filter(lib =>
    lib.isLibrary && lib.hasSelectors && lib.shouldStayLibrary
  )

  if (librariesWithSelectors.length > 0) {
    console.log(`\\n⚠️  LIBRARIES WITH SELECTORS (${librariesWithSelectors.length}):`)
    librariesWithSelectors.forEach(lib => {
      console.log(`   📚 ${lib.name} - has external/public functions (may be intentional)`)
    })
    if (strict) {
      errors += librariesWithSelectors.length
    }
  }

  console.log('\\n📊 CLASSIFICATION SUMMARY')
  console.log('─────────────────────────')
  console.log(`Total files analyzed: ${libraries.length}`)
  console.log(`Correct libraries: ${correctLibraries.length}`)
  console.log(`Should be libraries: ${incorrectContracts.length}`)
  console.log(`Proper facets: ${facetsWithSelectors.length}`)
  console.log(`Errors: ${errors}`)

  if (errors === 0) {
    console.log('\\n✅ ALL LIBRARY CLASSIFICATIONS CORRECT')
    process.exit(0)
  } else {
    console.log('\\n❌ LIBRARY CLASSIFICATION ISSUES FOUND')
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
    console.error('💥 Library classification failed:', error)
    process.exit(1)
  })
}
