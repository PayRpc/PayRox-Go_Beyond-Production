#!/usr/bin/env ts-node
import fs from 'fs'
import path from 'path'
import { Interface } from 'ethers'

const name = process.argv[2]
const manifestPath = process.argv[3] || 'manifest.local.json'
const facetAddr = process.argv[4] || '<fill-facet-address>'

if (!name) {
  console.error('Usage: add-facet-routes <FacetName> [manifest.json] [facetAddress]')
  process.exit(1)
}

const artifactsDir = path.join('artifacts', 'contracts', 'facets', `${name}Facet.sol`)
const artifactFile = path.join(artifactsDir, `${name}Facet.json`)
if (!fs.existsSync(artifactFile)) {
  console.error('Artifact not found, did you compile?', artifactFile)
  process.exit(2)
}
const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf8'))
const iface = new Interface(artifact.abi)

// Build minimal route entries
const routes = iface.fragments
  .filter(fragment => fragment.type === 'function')
  .map(fragment => {
    const funcFragment = fragment as any // Cast to avoid TypeScript issues
    const selector = iface.getFunction(funcFragment.name)?.selector
    const fnName = funcFragment.name
    return {
      name: fnName,
      path: `/${fnName}`,
      selector,
      facet: facetAddr,
      functionName: fnName
    }
  })
  .filter(route => route.selector) // Remove any routes without selectors

// Merge into manifest
let manifest: any = { routes: [] }
if (fs.existsSync(manifestPath)) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!Array.isArray(manifest.routes)) manifest.routes = []
}
manifest.routes = [...manifest.routes, ...routes]

// Deduplicate by selector
const seen = new Set<string>()
manifest.routes = manifest.routes.filter((r: any) => {
  if (seen.has(r.selector)) return false
  seen.add(r.selector)
  return true
})

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`Appended ${routes.length} routes for ${name}Facet → ${manifestPath}`)
