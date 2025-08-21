import { task } from 'hardhat/config'
import fs from 'fs'
import path from 'path'

task('facet:init', 'Initialize a generated facet via the Diamond/Dispatcher')
  .addParam('name', 'Facet name, e.g. Payments')
  .addParam('operator', 'Operator address')
  .addParam('diamond', 'Diamond/Dispatcher address')
  .setAction(async (args, hre) => {
    const { name, operator, diamond } = args as {
      name: string
      operator: string
      diamond: string
    }

    const artifactPath = path.join(
      hre.config.paths.artifacts,
      'contracts',
      'facets',
      `${name}Facet.sol`,
      `${name}Facet.json`
    )

    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found: ${artifactPath}. Compile first.`)
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
    const [signer] = await hre.ethers.getSigners()
    const diamondAsFacet = new hre.ethers.Contract(diamond, artifact.abi, signer)

    const initFunction = diamondAsFacet[`initialize${name}`]
    if (typeof initFunction !== 'function') {
      throw new Error(`Function initialize${name} not found in facet ABI`)
    }

    const tx = await initFunction(operator)
    console.log('init tx:', tx.hash)
    await tx.wait()
    console.log(`Initialized ${name}Facet via ${diamond}`)
  })
