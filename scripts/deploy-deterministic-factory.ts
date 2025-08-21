/**
 * Deterministic Factory Deployment Script
 * SPDX-License-Identifier: MIT
 * 
 * Deploys DeterministicChunkFactory with identical addresses across chains
 */

import { type HardhatRuntimeEnvironment } from 'hardhat/types'
import { type Contract } from 'ethers'
import { ethers as EthersLib } from 'ethers'

/**
 * Helper to create a provider and wallet for a given Hardhat network name.
 * Uses network URL from hre.config.networks[networkName].url and DEPLOYER_PRIVATE_KEY env var.
 */
async function getProviderAndWallet(hre: HardhatRuntimeEnvironment, networkName: string) {
  const netCfg = hre.config.networks[networkName]
  if (!netCfg || !(netCfg as any).url) {
    throw new Error(`Network ${networkName} not configured with a url in hardhat.config.ts`)
  }
  const rpcUrl = (netCfg as any).url as string
  const provider = new EthersLib.JsonRpcProvider(rpcUrl)
  const pk = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || ''
  const wallet = pk ? new EthersLib.Wallet(pk, provider) : undefined
  return { provider, wallet }
}

export interface FactoryDeploymentConfig {
  networks: string[]
  validateOnly?: boolean
  force?: boolean
}

export class DeterministicFactoryDeployer {
  private readonly FACTORY_SALT = '0x0000000000000000000000000000000000000000000000000000000000000001'
  private readonly EIP2470_DEPLOYER = '0x4e59b44847b379578588920cA78FbF26c0B4956C'

  async validateFactoryAddressParity(
    networks: string[], 
    hre: HardhatRuntimeEnvironment
  ): Promise<{ valid: boolean; expectedAddress?: string; networks: Record<string, any> }> {
    console.log('🔍 Validating factory address parity across networks...')
    
    const results: Record<string, any> = {}
    let expectedAddress: string | undefined
    
    for (const networkName of networks) {
      try {
        const network = hre.config.networks[networkName]
        if (!network) {
          results[networkName] = { error: 'Network not configured' }
          continue
        }
  // Create provider + wallet for the target network instead of using non-standard hre.changeNetwork
  const { provider, wallet } = await getProviderAndWallet(hre, networkName)
        
        // Get factory contract
        const DeterministicChunkFactory = await hre.ethers.getContractFactory('DeterministicChunkFactory')
        
        // Predict address using CREATE2
        const initCodeHash = hre.ethers.keccak256(DeterministicChunkFactory.bytecode)
        const predictedAddress = hre.ethers.getCreate2Address(
          this.EIP2470_DEPLOYER,
          this.FACTORY_SALT,
          initCodeHash
        )
        
        if (!expectedAddress) {
          expectedAddress = predictedAddress
        }
        
  // Check if factory exists
  const code = await provider.getCode(predictedAddress)
        const exists = code !== '0x'
        
        results[networkName] = {
          expectedAddress: predictedAddress,
          exists,
          matches: predictedAddress === expectedAddress
        }
        
        console.log(`  ${networkName}: ${exists ? '✅' : '❌'} ${predictedAddress}`)
        
      } catch (error) {
        results[networkName] = { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }
        console.log(`  ${networkName}: ❌ Error - ${results[networkName].error}`)
      }
    }
    
    const allMatch = Object.values(results).every(r => r.matches !== false && !r.error)
    
    return {
      valid: allMatch,
      expectedAddress,
      networks: results
    }
  }

  async deployFactory(
    networks: string[],
    hre: HardhatRuntimeEnvironment,
    config: FactoryDeploymentConfig
  ): Promise<string> {
    console.log('🏭 Deploying DeterministicChunkFactory across networks...')
    
    let factoryAddress: string | undefined
    
    for (const networkName of networks) {
      try {
        console.log(`\n🌐 Deploying to ${networkName}...`)
        
      // Create provider + wallet for the target network
      const { provider, wallet } = await getProviderAndWallet(hre, networkName)

    // Check if EIP-2470 deployer exists
    const deployerCode = await provider.getCode(this.EIP2470_DEPLOYER)
        if (deployerCode === '0x') {
          throw new Error(`EIP-2470 deployer not available on ${networkName}`)
        }
        
        // Get factory contract
        const DeterministicChunkFactory = await hre.ethers.getContractFactory('DeterministicChunkFactory')
        
        // Predict address
        const initCodeHash = hre.ethers.keccak256(DeterministicChunkFactory.bytecode)
        const predictedAddress = hre.ethers.getCreate2Address(
          this.EIP2470_DEPLOYER,
          this.FACTORY_SALT,
          initCodeHash
        )
        
        if (!factoryAddress) {
          factoryAddress = predictedAddress
        } else if (factoryAddress !== predictedAddress) {
          throw new Error(`Address mismatch on ${networkName}: expected ${factoryAddress}, got ${predictedAddress}`)
        }
        
        // Check if already deployed
        const existingCode = await provider.getCode(predictedAddress)
        if (existingCode !== '0x') {
          console.log(`  ✅ Factory already exists at ${predictedAddress}`)
          continue
        }
        
        // Deploy using CREATE2 through the singleton factory. Requires a signer (wallet).
        if (!wallet) {
          throw new Error('No deployer wallet available for network; set DEPLOYER_PRIVATE_KEY env var')
        }

  const deploymentData = DeterministicChunkFactory.bytecode || ''
  if (!deploymentData) throw new Error('Failed to obtain deployment bytecode/data')

        const txRequest = {
          to: this.EIP2470_DEPLOYER,
          data: this.FACTORY_SALT + deploymentData.slice(2),
          gasLimit: 2_000_000
        }

        const tx = await wallet.sendTransaction(txRequest)
        const receipt = await tx.wait()
        
        console.log(`  ✅ Factory deployed at ${predictedAddress}`)
        console.log(`     Tx: ${receipt?.hash}`)
        
      } catch (error) {
        console.error(`  ❌ Failed to deploy on ${networkName}:`, error)
        throw error
      }
    }
    
    if (!factoryAddress) {
      throw new Error('No factory address determined')
    }
    
    console.log(`\n🎉 Factory deployed successfully at: ${factoryAddress}`)
    return factoryAddress
  }
}

export async function main(
  hre: HardhatRuntimeEnvironment,
  config: FactoryDeploymentConfig
): Promise<string> {
  const deployer = new DeterministicFactoryDeployer()
  
  if (config.validateOnly) {
    const validation = await deployer.validateFactoryAddressParity(config.networks, hre)
    if (!validation.valid) {
      throw new Error('Factory address parity validation failed')
    }
    return validation.expectedAddress!
  }
  
  return await deployer.deployFactory(config.networks, hre, config)
}

// Export for Hardhat tasks
export { main as default }
