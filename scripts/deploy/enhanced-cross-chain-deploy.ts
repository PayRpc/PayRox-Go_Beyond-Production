import fs from 'fs';
import path from 'path';
/**
 * Enhanced Cross-Chain Deployment Script
 *
 * Implements practical guidance for deterministic deployment:
 * "Same address across chains requires same deployer, same init-code, same salt…
 *  if you rely on your ChunkFactory as the CREATE2 deployer, that factory must
 *  exist at the same address on every chain… Salt policy: chain-agnostic or
 *  chain-scoped; cross-chain example salt = keccak256(manifestHash || componentId || version)."
 *
 * Features:
 * - Deployer presence detection
 * - Link-map freezing
 * - Manifest annotations
 * - Cross-chain consistency validation
 */

const hre: any = require('hardhat')
import type { ContractFactory } from 'ethers'

// ══════════════════════════════════════════════════════════════════════
// INTERFACES & TYPES
// ══════════════════════════════════════════════════════════════════════

interface DeploymentConfig {
  manifestHash: string
  version: string
  chainScoped: boolean
  deployer?: string
  components: ComponentDefinition[]
  targetChains: number[]
  freezeAfterDeploy: boolean
}

interface ComponentDefinition {
  id: string
  contractName: string
  constructorArgs?: any[]
  dependencies?: string[]
}

interface DeploymentResult {
  chainId: number
  deployer: string
  deploymentManager: string
  components: Record<string, {
    address: string
    salt: string
    initCodeHash: string
    isConsistent: boolean
  }>
  linkMapHash: string
  frozen: boolean
}

interface CrossChainManifest {
  manifestHash: string
  version: string
  timestamp: string
  chainResults: Record<number, DeploymentResult>
  consistencyReport: {
    allChainsConsistent: boolean
    componentConsistency: Record<string, boolean>
    deployerConsistency: boolean
  }
}

// ══════════════════════════════════════════════════════════════════════
// ENHANCED DEPLOYMENT CLASS
// ══════════════════════════════════════════════════════════════════════

class EnhancedCrossChainDeployer {
  private config: DeploymentConfig
  private artifacts = new Map<string, ContractFactory>()
  private deploymentResults = new Map<number, DeploymentResult>()

  constructor(config: DeploymentConfig) {
    this.config = config
  }

  /**
   * Main deployment orchestrator
   */
  async deploy(): Promise<CrossChainManifest> {
    console.log('🚀 Enhanced Cross-Chain Deployment Starting...')
    console.log(`📋 Manifest Hash: ${this.config.manifestHash}`)
    console.log(`📦 Version: ${this.config.version}`)
    console.log(`🔗 Chain Scoped: ${this.config.chainScoped}`)
    console.log(`🎯 Target Chains: ${this.config.targetChains.join(', ')}`)

    // Step 1: Validate configuration
    await this.validateConfiguration()

    // Step 2: Load artifacts
    await this.loadArtifacts()

    // Step 3: Check deployer presence across chains
    await this.checkDeployerPresence()

    // Step 4: Deploy to current chain
    const currentChainId = Number((await hre.ethers.provider.getNetwork()).chainId)
    await this.deployToChain(currentChainId)

    // Step 5: Generate cross-chain manifest
    const manifest = await this.generateManifest()

    // Step 6: Save results
    await this.saveResults(manifest)

    console.log('✅ Enhanced Cross-Chain Deployment Complete!')
    return manifest
  }

  /**
   * Validate deployment configuration
   */
  private async validateConfiguration(): Promise<void> {
    console.log('🔍 Validating configuration...')

    if (!this.config.manifestHash || this.config.manifestHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      throw new Error('Invalid manifest hash')
    }

    if (!this.config.version) {
      throw new Error('Version is required')
    }

    if (this.config.components.length === 0) {
      throw new Error('At least one component must be defined')
    }

    // Validate component IDs are unique
    const componentIds = this.config.components.map(c => c.id)
    const uniqueIds = new Set(componentIds)
    if (uniqueIds.size !== componentIds.length) {
      throw new Error('Component IDs must be unique')
    }

    console.log('✅ Configuration valid')
  }

  /**
   * Load contract artifacts for all components
   */
  private async loadArtifacts(): Promise<void> {
    console.log('📦 Loading contract artifacts...')

    for (const component of this.config.components) {
      try {
        const factory = await hre.ethers.getContractFactory(component.contractName)
        this.artifacts.set(component.id, factory)
        console.log(`  ✅ ${component.id}: ${component.contractName}`)
      } catch (error) {
        throw new Error(`Failed to load artifact for ${component.contractName}: ${error}`)
      }
    }
  }

  /**
   * Check deployer presence across target chains
   */
  private async checkDeployerPresence(provider?: any): Promise<void> {
    console.log('🔍 Checking deployer presence...')

    const p = provider ?? hre.ethers.provider
    const currentChainId = Number((await p.getNetwork()).chainId)

    // For now, only check current chain (or provided provider)
    const deployerAddr = this.config.deployer || '0x4e59b44847b379578588920cA78FbF26c0B4956C' // EIP-2470

    const code = await p.getCode(deployerAddr)
    const isPresent = code !== '0x' && code.length > 2

    console.log(`  Chain ${currentChainId}: ${deployerAddr}`)
    console.log(`    Present: ${isPresent ? '✅' : '❌'}`)
    console.log(`    Code Size: ${Math.floor((code.length - 2) / 2)} bytes`)

    if (!isPresent) {
      console.warn(`⚠️  Deployer not present on chain ${currentChainId}`)
      console.warn(`    Consider deploying EIP-2470 singleton first`)
    }
  }

  /**
   * Deploy to a specific chain
   */
  private async deployToChain(chainId: number, overrides?: { provider?: any; wallet?: any }): Promise<void> {
    console.log(`🎯 Deploying to chain ${chainId}...`)

    // Step 1: Deploy DeterministicDeploymentManager
    console.log('  📋 Deploying DeterministicDeploymentManager...')
    const wallet = overrides?.wallet

    const DeploymentManagerFactory = this.artifacts.get('DeterministicDeploymentManager')
      ?? (await hre.ethers.getContractFactory('DeterministicDeploymentManager'))

    const dmFactory = wallet ? DeploymentManagerFactory.connect(wallet) : DeploymentManagerFactory
    const deploymentManager = await dmFactory.deploy(
      this.config.manifestHash,
      this.config.deployer || '0x4e59b44847b379578588920cA78FbF26c0B4956C', // EIP-2470 default
      this.config.chainScoped
    )
    await deploymentManager.waitForDeployment()

    const managerAddress = await deploymentManager.getAddress()
    console.log(`    ✅ Manager deployed at: ${managerAddress}`)

    // Step 2: Deploy components through manager
    const componentResults: Record<string, any> = {}

    for (const component of this.config.components) {
      console.log(`  🔧 Deploying component: ${component.id}`)

      const factory = this.artifacts.get(component.id)!
      const constructorArgs = component.constructorArgs || []

  // Get deployment bytecode with constructor args
  // getDeployTransaction may be async depending on environment; await to ensure .data is available
  const deployTx = await factory.getDeployTransaction(...constructorArgs)
  const initCode = deployTx.data!

      // Deploy through manager (manager is already connected to signer)
      const tx = await deploymentManager.deployComponent(
        component.id,
        this.config.version,
        initCode,
        this.config.chainScoped
      )
      const receipt = await tx.wait()

      // Get deployed address from event
      const event = receipt!.logs.find((log: any) => {
        try {
          const parsed = deploymentManager.interface.parseLog(log)
          return parsed?.name === 'ComponentDeployed'
        } catch {
          return false
        }
      })

      if (!event) {
        throw new Error(`Failed to find ComponentDeployed event for ${component.id}`)
      }

      const parsedEvent = deploymentManager.interface.parseLog(event)!
      const deployedAddress = parsedEvent.args.deployed

      // Predict address for verification
      const [predicted, salt, initCodeHash] = await deploymentManager.predictComponentAddress(
        component.id,
        this.config.version,
        initCode,
        this.config.chainScoped
      )

      const isConsistent = deployedAddress.toLowerCase() === predicted.toLowerCase()

      componentResults[component.id] = {
        address: deployedAddress,
        salt: salt,
        initCodeHash: initCodeHash,
        isConsistent: isConsistent
      }

      console.log(`    ✅ ${component.id}: ${deployedAddress}`)
      console.log(`    🔍 Predicted: ${predicted}`)
      console.log(`    ✅ Consistent: ${isConsistent}`)
    }

    // Step 3: Freeze manifest if requested
    let linkMapHash = ''
    let frozen = false

    if (this.config.freezeAfterDeploy) {
      console.log('  🔒 Freezing deployment manifest...')

      const componentIds = Object.keys(componentResults)
      const addresses = componentIds.map(id => componentResults[id].address)

      const freezeTx = await deploymentManager.freezeManifest(componentIds, addresses)
      await freezeTx.wait()

      const [isFrozen, , frozenLinkMapHash] = await deploymentManager.getManifestFreezeStatus()
      linkMapHash = frozenLinkMapHash
      frozen = isFrozen

      console.log(`    ✅ Manifest frozen with link-map hash: ${linkMapHash}`)
    }

    // Store result
    this.deploymentResults.set(chainId, {
      chainId,
      deployer: this.config.deployer || '0x4e59b44847b379578588920cA78FbF26c0B4956C',
      deploymentManager: managerAddress,
      components: componentResults,
      linkMapHash,
      frozen
    })
  }

  /**
   * Public wrapper to deploy to a specific chain using an injected provider/wallet.
   * Returns the recorded DeploymentResult for the chain.
   */
  public async deployToChainPublic(chainId: number, provider?: any, wallet?: any): Promise<DeploymentResult> {
    await this.checkDeployerPresence(provider)
    await this.loadArtifacts()
    await this.deployToChain(chainId, { provider, wallet })
    // return recorded result
    const res = this.deploymentResults.get(chainId)
    if (!res) throw new Error(`No deployment result for chain ${chainId}`)
    return res
  }

  /**
   * Generate cross-chain deployment manifest
   */
  private async generateManifest(): Promise<CrossChainManifest> {
    console.log('📝 Generating cross-chain manifest...')

    // Convert deployment results to manifest format
    const chainResults: Record<number, DeploymentResult> = {}
    this.deploymentResults.forEach((result, chainId) => {
      chainResults[chainId] = result
    })

    // Analyze consistency across chains
    const consistencyReport = this.analyzeConsistency()

    return {
      manifestHash: this.config.manifestHash,
      version: this.config.version,
      timestamp: new Date().toISOString(),
      chainResults,
      consistencyReport
    }
  }

  /**
   * Analyze cross-chain consistency
   */
  private analyzeConsistency() {
    console.log('🔍 Analyzing cross-chain consistency...')

    const results = Array.from(this.deploymentResults.values())

    if (results.length <= 1) {
      return {
        allChainsConsistent: true,
        componentConsistency: {},
        deployerConsistency: true
      }
    }

    // Check deployer consistency
    const deployers = new Set(results.map(r => r.deployer.toLowerCase()))
    const deployerConsistency = deployers.size === 1

    // Check component address consistency
    const componentConsistency: Record<string, boolean> = {}
  const componentIds = Object.keys(results[0]!.components)

    for (const componentId of componentIds) {
      const addresses = new Set(
        results.map(r => r.components[componentId]?.address?.toLowerCase()).filter(Boolean)
      )
      componentConsistency[componentId] = addresses.size === 1
    }

    const allComponentsConsistent = Object.values(componentConsistency).every(Boolean)
    const allChainsConsistent = deployerConsistency && allComponentsConsistent

    console.log(`  ✅ Deployer Consistent: ${deployerConsistency}`)
    console.log(`  ✅ All Components Consistent: ${allComponentsConsistent}`)
    console.log(`  ✅ Overall Consistent: ${allChainsConsistent}`)

    return {
      allChainsConsistent,
      componentConsistency,
      deployerConsistency
    }
  }

  /**
   * Save deployment results to files
   */
  private async saveResults(manifest: CrossChainManifest): Promise<void> {
    console.log('💾 Saving deployment results...')

    // Ensure directories exist
    const manifestsDir = path.resolve('./manifests')
    const deploymentsDir = path.resolve('./deployments')

    if (!fs.existsSync(manifestsDir)) {
      fs.mkdirSync(manifestsDir, { recursive: true })
    }
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true })
    }

    // Save main manifest
    const manifestPath = path.join(manifestsDir, `deployment-manifest-${this.config.version}.json`)
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    console.log(`  ✅ Manifest: ${manifestPath}`)

    // Save individual chain results
    for (const [chainId, result] of Array.from(this.deploymentResults)) {
      const resultPath = path.join(deploymentsDir, `chain-${chainId}-${this.config.version}.json`)
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
      console.log(`  ✅ Chain ${chainId}: ${resultPath}`)
    }

    // Save consistency report
    const reportPath = path.join(manifestsDir, `consistency-report-${this.config.version}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(manifest.consistencyReport, null, 2))
    console.log(`  ✅ Consistency Report: ${reportPath}`)
  }
}

// ══════════════════════════════════════════════════════════════════════
// DEPLOYMENT SCRIPT
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🌍 Enhanced PayRox Cross-Chain Deployment')
  console.log('==========================================')

  // Configuration - adjust as needed
  const config: DeploymentConfig = {
    manifestHash: process.env.MANIFEST_HASH || '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    version: process.env.DEPLOYMENT_VERSION || '1.0.0',
    chainScoped: (process.env.CHAIN_SCOPED || 'false').toLowerCase() === 'true',
    deployer: process.env.DEPLOYER_ADDRESS, // Will default to EIP-2470 if not provided
    targetChains: [1, 137, 42161, 10, 8453], // Example: Ethereum, Polygon, Arbitrum, Optimism, Base
    freezeAfterDeploy: (process.env.FREEZE_AFTER_DEPLOY || 'true').toLowerCase() === 'true',
    components: [
      {
        id: 'ChunkFactory',
        contractName: 'DeterministicChunkFactory',
        constructorArgs: [
          '0x0000000000000000000000000000000000000000', // feeRecipient - will be set properly
          '0x0000000000000000000000000000000000000000', // manifestDispatcher - will be set properly
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // manifestHash
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // dispatcherCodehash
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // factoryBytecodeHash
          0, // baseFeeWei
          false // feesEnabled
        ]
      },
      {
        id: 'SaltViewFacet',
        contractName: 'SaltViewFacet',
        constructorArgs: []
      }
    ]
  }

  // Deploy
  const deployer = new EnhancedCrossChainDeployer(config)
  const manifest = await deployer.deploy()

  // Summary
  console.log('\n📊 DEPLOYMENT SUMMARY')
  console.log('====================')
  console.log(`Manifest Hash: ${manifest.manifestHash}`)
  console.log(`Version: ${manifest.version}`)
  console.log(`Chains Deployed: ${Object.keys(manifest.chainResults).length}`)
  console.log(`Overall Consistent: ${manifest.consistencyReport.allChainsConsistent ? '✅' : '❌'}`)

  if (!manifest.consistencyReport.allChainsConsistent) {
    console.log('\n⚠️  CONSISTENCY ISSUES DETECTED:')

    if (!manifest.consistencyReport.deployerConsistency) {
      console.log('❌ Deployer addresses are inconsistent across chains')
    }

    for (const [componentId, isConsistent] of Object.entries(manifest.consistencyReport.componentConsistency)) {
      if (!isConsistent) {
        console.log(`❌ Component ${componentId} has inconsistent addresses`)
      }
    }

    console.log('\nReview the consistency report for details.')
  }

  console.log('\n🎉 Deployment Complete!')
}

// ══════════════════════════════════════════════════════════════════════
// SCRIPT EXECUTION
// ══════════════════════════════════════════════════════════════════════

main().catch((error) => {
  console.error('💥 Deployment failed:', error)
  process.exit(1)
})

export { EnhancedCrossChainDeployer, type DeploymentConfig, type CrossChainManifest }
