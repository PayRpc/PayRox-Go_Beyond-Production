/**
 * Cross-Chain Deployment Orchestration Script
 * SPDX-License-Identifier: MIT
 * 
 * Orchestrates complete cross-chain deployment workflow
 */

import { type HardhatRuntimeEnvironment } from 'hardhat/types'
import { main as deployDeterministicFactory } from './deploy-deterministic-factory'
import { validateManifestPreflight } from './manifest-preflight'
import { EnhancedCrossChainDeployer } from './deploy/enhanced-cross-chain-deploy'
import * as fs from 'fs'
import * as path from 'path'
import { ethers as EthersLib } from 'ethers'

async function getProviderAndWallet(hre: HardhatRuntimeEnvironment, networkName: string) {
  const netCfg = hre.config.networks[networkName]
  if (!netCfg || !(netCfg as any).url) throw new Error(`Network ${networkName} not configured with a url`)
  const provider = new EthersLib.JsonRpcProvider((netCfg as any).url as string)
  const pk = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || ''
  const wallet = pk ? new EthersLib.Wallet(pk, provider) : undefined
  return { provider, wallet }
}

export interface OrchestrationConfig {
  networks: string[]
  manifestPath?: string
  skipFactoryDeployment?: boolean
  skipManifestValidation?: boolean
  dryRun?: boolean
  pausedDeployment?: boolean
  governanceAddress?: string
  force?: boolean
}

export interface OrchestrationResult {
  success: boolean
  factoryAddress?: string
  deploymentResults?: Record<string, any>
  duration?: number
  errors?: string[]
}

export async function main(
  hre: HardhatRuntimeEnvironment,
  config: OrchestrationConfig
): Promise<OrchestrationResult> {
  const startTime = Date.now()
  console.log('🎭 Starting Cross-Chain Deployment Orchestration')
  console.log('='.repeat(65))
  
  const result: OrchestrationResult = {
    success: false,
    deploymentResults: {}
  }
  
  try {
    // 1. FACTORY DEPLOYMENT PHASE
    let factoryAddress: string | undefined
    
    if (!config.skipFactoryDeployment) {
      console.log('\n🏭 PHASE 1: FACTORY DEPLOYMENT')
      console.log('-'.repeat(40))
      
      try {
        factoryAddress = await deployDeterministicFactory(hre, {
          networks: config.networks,
          validateOnly: config.dryRun,
          force: config.force
        })
        
        result.factoryAddress = factoryAddress
        console.log(`✅ Factory phase completed: ${factoryAddress}`)
        
      } catch (error) {
        const errorMsg = `Factory deployment failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors = result.errors || []
        result.errors.push(errorMsg)
        
        if (!config.force) {
          return result
        }
      }
    } else {
      console.log('\n⏭️  PHASE 1: FACTORY DEPLOYMENT SKIPPED')
    }
    
    // 2. MANIFEST VALIDATION PHASE
    if (!config.skipManifestValidation && config.manifestPath) {
      console.log('\n📋 PHASE 2: MANIFEST VALIDATION')
      console.log('-'.repeat(40))
      
      try {
        const isValid = await validateManifestPreflight(
          config.manifestPath,
          config.networks,
          hre,
          path.join(process.cwd(), 'reports')
        )
        
        if (!isValid && !config.force) {
          result.errors = result.errors || []
          result.errors.push('Manifest validation failed')
          return result
        }
        
        console.log('✅ Manifest validation completed')
        
      } catch (error) {
        const errorMsg = `Manifest validation failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors = result.errors || []
        result.errors.push(errorMsg)
        
        if (!config.force) {
          return result
        }
      }
    } else {
      console.log('\n⏭️  PHASE 2: MANIFEST VALIDATION SKIPPED')
    }
    
    // 3. COMPONENT DEPLOYMENT PHASE
    if (!config.dryRun && config.manifestPath) {
      console.log('\n🚀 PHASE 3: COMPONENT DEPLOYMENT')
      console.log('-'.repeat(40))
      
      try {
        // Load manifest
        const manifestContent = fs.readFileSync(config.manifestPath, 'utf-8')
        const manifest = JSON.parse(manifestContent)
        
        // Initialize enhanced deployer
        const deployer = new EnhancedCrossChainDeployer({
          manifestHash: manifest.manifestHash || hre.ethers.keccak256(
            hre.ethers.toUtf8Bytes(JSON.stringify({
              version: manifest.version,
              components: manifest.components
            }))
          ),
          version: manifest.version,
          chainScoped: false,
          deployer: factoryAddress,
          components: manifest.components,
          targetChains: [], // Will be filled from networks
          freezeAfterDeploy: true
        })
        
    // Deploy across networks
  for (const networkName of config.networks) {
          console.log(`\n🌐 Deploying to ${networkName}...`)
          
          try {
      const { provider, wallet } = await getProviderAndWallet(hre, networkName)
      const chainId = await provider.getNetwork().then(n => Number(n.chainId))

      // Call the public per-chain deploy method with injected provider/wallet
      const networkResult = await deployer.deployToChainPublic(chainId, provider, wallet)

      result.deploymentResults![networkName] = {
        factoryDeployed: true,
        dispatcherDeployed: networkResult.deploymentManager !== '0x0000000000000000000000000000000000000000',
        manifestValidated: true,
        ...networkResult,
        chainId,
      }
            
            console.log(`  ✅ ${networkName} deployment completed`)
            
          } catch (error) {
            console.error(`  ❌ ${networkName} deployment failed:`, error)
            result.deploymentResults![networkName] = {
              factoryDeployed: false,
              dispatcherDeployed: false,
              manifestValidated: false,
              errors: [error instanceof Error ? error.message : String(error)]
            }
            
            if (!config.force) {
              result.errors = result.errors || []
              result.errors.push(`Network ${networkName} deployment failed`)
              return result
            }
          }
        }
        
        console.log('✅ Component deployment phase completed')
        
      } catch (error) {
        const errorMsg = `Component deployment failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors = result.errors || []
        result.errors.push(errorMsg)
        return result
      }
    } else {
      console.log('\n⏭️  PHASE 3: COMPONENT DEPLOYMENT SKIPPED (dry run or no manifest)')
    }
    
    // 4. FINALIZATION
    console.log('\n🎯 PHASE 4: FINALIZATION')
    console.log('-'.repeat(40))
    
    if (config.pausedDeployment) {
      console.log('⏸️  Deployment completed in PAUSED state (governance activation required)')
    }
    
    // Generate deployment summary
    const reportPath = path.join(process.cwd(), 'reports', `deployment-${Date.now()}.json`)
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      config,
      result,
      networks: config.networks,
      factoryAddress: result.factoryAddress
    }, null, 2))
    
    console.log(`📄 Deployment report saved to: ${reportPath}`)
    
    result.success = true
    result.duration = Date.now() - startTime
    
    return result
    
  } catch (error) {
    console.error('❌ Orchestration failed:', error)
    result.errors = result.errors || []
    result.errors.push(error instanceof Error ? error.message : String(error))
    result.duration = Date.now() - startTime
    return result
  }
}

export default main
