import fs from 'fs';
import path from 'path';
/**
 * Manifest Preflight Validation Script
 * SPDX-License-Identifier: MIT
 *
 * Validates manifests before cross-chain deployment
 */

import { type HardhatRuntimeEnvironment } from 'hardhat/types'
import { ethers as EthersLib } from 'ethers'

async function getProviderAndWallet(hre: HardhatRuntimeEnvironment, networkName: string) {
  const netCfg = hre.config.networks[networkName]
  if (!netCfg || !(netCfg as any).url) throw new Error(`Network ${networkName} not configured with a url`)
  const provider = new EthersLib.JsonRpcProvider((netCfg as any).url as string)
  const pk = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || ''
  const wallet = pk ? new EthersLib.Wallet(pk, provider) : undefined
  return { provider, wallet }
}

export interface ManifestValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  networkResults: Record<string, {
    factoryExists: boolean
    manifestHash: string
    predictedAddresses: Record<string, string>
  }>
}

export async function validateManifestPreflight(
  manifestPath: string,
  networks: string[],
  hre: HardhatRuntimeEnvironment,
  outputPath?: string
): Promise<boolean> {
  console.log('📋 Running manifest preflight validation...')

  const result: ManifestValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    networkResults: {}
  }

  try {
    // 1. Validate manifest file exists and is valid JSON
    if (!fs.existsSync(manifestPath)) {
      result.errors.push(`Manifest file not found: ${manifestPath}`)
      result.valid = false
      return false
    }

    let manifest: any
    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8')
      manifest = JSON.parse(manifestContent)
    } catch (error) {
      result.errors.push(`Invalid JSON in manifest: ${error}`)
      result.valid = false
      return false
    }

    // 2. Validate manifest structure
    if (!manifest.version) {
      result.errors.push('Manifest missing version field')
      result.valid = false
    }

    if (!manifest.components || !Array.isArray(manifest.components)) {
      result.errors.push('Manifest missing or invalid components array')
      result.valid = false
    }

    if (!manifest.manifestHash) {
      result.warnings.push('Manifest missing manifestHash - will be generated')
    }

    // 3. Calculate manifest hash if missing
    const manifestHash = manifest.manifestHash || hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes(JSON.stringify({
        version: manifest.version,
        components: manifest.components
      }))
    )

    // 4. Validate across networks
    for (const networkName of networks) {
      try {
        console.log(`  🌐 Validating ${networkName}...`)
        // Create provider for the target network
        const { provider } = await getProviderAndWallet(hre, networkName)

        const networkResult: {
          factoryExists: boolean
          manifestHash: string
          predictedAddresses: Record<string, string>
        } = {
          factoryExists: false,
          manifestHash,
          predictedAddresses: {}
        }

        // Check if deterministic factory exists (placeholder - replace with real factory address)
        const factoryAddress = '0x0000000000000000000000000000000000000000'
        const factoryCode = await provider.getCode(factoryAddress)
        networkResult.factoryExists = factoryCode !== '0x'

        if (!networkResult.factoryExists) {
          result.warnings.push(`DeterministicChunkFactory not deployed on ${networkName}`)
        }

        // Validate component addresses can be predicted
        for (const component of manifest.components) {
          try {
            // Predict address using cross-chain salt policy
            const salt = EthersLib.keccak256(
              EthersLib.concat([
                EthersLib.hexlify(EthersLib.toUtf8Bytes(manifestHash)),
                EthersLib.hexlify(EthersLib.toUtf8Bytes(component.id)),
                EthersLib.hexlify(EthersLib.toUtf8Bytes(manifest.version))
              ])
            )

            const contractFactory = await hre.ethers.getContractFactory(component.contractName)
            const initCodeHash = EthersLib.keccak256((contractFactory as any).bytecode)

            const predictedAddress = EthersLib.getCreate2Address(
              factoryAddress,
              salt,
              initCodeHash
            )

            networkResult.predictedAddresses[component.id] = predictedAddress

          } catch (error) {
            result.errors.push(`Failed to predict address for ${component.id} on ${networkName}: ${error}`)
            result.valid = false
          }
        }

        result.networkResults[networkName] = networkResult
        console.log(`    ✅ Validation complete`)

      } catch (error) {
        result.errors.push(`Network validation failed for ${networkName}: ${error}`)
        result.valid = false
        console.log(`    ❌ Validation failed: ${error}`)
      }
    }

    // 5. Cross-network consistency check
    const addressSets = Object.values(result.networkResults).map(r => r.predictedAddresses)
    if (addressSets.length > 1) {
      const firstSet = addressSets[0]
      for (let i = 1; i < addressSets.length; i++) {
        const currentSet = addressSets[i]
        if (!currentSet) continue
        for (const componentId in firstSet) {
          if (firstSet[componentId] !== currentSet[componentId]) {
            result.errors.push(
              `Address mismatch for component ${componentId}: ${firstSet[componentId]} vs ${currentSet[componentId]}`
            )
            result.valid = false
          }
        }
      }
    }

    // 6. Generate report
    if (outputPath) {
      const reportPath = outputPath.endsWith('.json') ? outputPath : path.join(outputPath, 'manifest-validation-report.json')
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })
      fs.writeFileSync(reportPath, JSON.stringify(result, null, 2))
      console.log(`📄 Validation report saved to: ${reportPath}`)
    }

    // 7. Summary
    console.log('\n📊 VALIDATION SUMMARY:')
    console.log(`   Status: ${result.valid ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`   Errors: ${result.errors.length}`)
    console.log(`   Warnings: ${result.warnings.length}`)

    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:')
      result.errors.forEach(error => console.log(`   • ${error}`))
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:')
      result.warnings.forEach(warning => console.log(`   • ${warning}`))
    }

    return result.valid

  } catch (error) {
    console.error('❌ Validation failed with error:', error)
    return false
  }
}

export default validateManifestPreflight
