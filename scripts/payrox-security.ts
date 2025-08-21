// SPDX-License-Identifier: MIT
/**
 * PayRox Quick Security Sweep
 * Lightweight checks to detect missing critical files and insecure settings.
 */

import * as fs from 'fs'
import * as path from 'path'

function exists(p: string) {
	return fs.existsSync(path.join(process.cwd(), p))
}

function checkEnvSecrets() {
	const keys = ['DEPLOYER_PRIVATE_KEY', 'PRIVATE_KEY', 'INFURA_API_KEY', 'ALCHEMY_API_KEY']
	const found = keys.filter(k => !!process.env[k])
	return { found, missing: keys.filter(k => !process.env[k]) }
}

function main() {
	console.log('🔐 PayRox quick security sweep')

	const required = [
		'hardhat.config.ts',
		'package.json',
		'contracts/Diamond.sol',
		'contracts/facets/DiamondCutFacet.sol'
	]

	const missing = required.filter(r => !exists(r))
	if (missing.length) {
		console.warn('⚠️ Missing critical files:')
		missing.forEach(m => console.warn('  -', m))
	} else {
		console.log('✅ Critical files present')
	}

	const envReport = checkEnvSecrets()
	if (envReport.found.length) {
		console.warn('⚠️ Sensitive environment variables set in current shell:')
		envReport.found.forEach(k => console.warn('  -', k))
	} else {
		console.log('✅ No common deployer secrets found in environment')
	}

	// Basic package.json sanity
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
		if (!pkg.scripts || !pkg.scripts.test) {
			console.warn('⚠️ package.json has no test script')
		} else {
			console.log('✅ package.json test script present')
		}
	} catch (e) {
		console.warn('⚠️ Could not read package.json')
	}

	console.log('\nCompleted quick security sweep')
}

if (require.main === module) {
	main()
}

export default main
