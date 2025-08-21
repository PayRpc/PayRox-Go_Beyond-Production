#!/usr/bin/env node

/**
 * Smart Shim for Facet Splitter Integration
 * 
 * This shim provides a safe migration path from the legacy AST-based splitter
 * to the new TypeScript implementation. It implements a three-tier fallback:
 * 1. Built JavaScript (production)
 * 2. ts-node execution (development) 
 * 3. Legacy AST splitter (rollback)
 * 
 * Environment Controls:
 * - SPLITTER_USE_LEGACY=1: Forces legacy AST splitter usage
 * - SPLITTER_DEBUG=1: Enables detailed execution logging
 * 
 * This preserves compatibility with existing pipeline callers while
 * allowing safe rollback if issues arise.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Environment configuration
const USE_LEGACY = process.env.SPLITTER_USE_LEGACY === '1';
const DEBUG = process.env.SPLITTER_DEBUG === '1';

function debug(message) {
    if (DEBUG) {
        console.error(`[SPLITTER_DEBUG] ${message}`);
    }
}

function findProjectRoot() {
    let current = __dirname;
    while (current !== path.dirname(current)) {
        if (fs.existsSync(path.join(current, 'package.json'))) {
            return current;
        }
        current = path.dirname(current);
    }
    throw new Error('Could not find project root (package.json)');
}

function executeBuiltJS(args) {
    const projectRoot = findProjectRoot();
    const builtPath = path.join(__dirname, 'dist', 'split-facet.js');
    
    debug(`Attempting built JS execution: ${builtPath}`);
    
    if (!fs.existsSync(builtPath)) {
        debug(`Built JS not found: ${builtPath}`);
        return false;
    }
    
    try {
        const result = execSync(`node "${builtPath}" ${args.join(' ')}`, {
            cwd: projectRoot,
            stdio: 'inherit'
        });
        debug('Built JS execution successful');
        return true;
    } catch (error) {
        debug(`Built JS execution failed: ${error.message}`);
        return false;
    }
}

function executeTsNode(args) {
    const projectRoot = findProjectRoot();
    const tsPath = path.join(projectRoot, 'tools', 'splitter', 'split-facet.ts');
    
    debug(`Attempting ts-node execution: ${tsPath}`);
    
    if (!fs.existsSync(tsPath)) {
        debug(`TypeScript source not found: ${tsPath}`);
        return false;
    }
    
    try {
        // Check if ts-node is available
        execSync('npx ts-node --version', { stdio: 'ignore' });
        
        const result = execSync(`npx ts-node "${tsPath}" ${args.join(' ')}`, {
            cwd: projectRoot,
            stdio: 'inherit'
        });
        debug('ts-node execution successful');
        return true;
    } catch (error) {
        debug(`ts-node execution failed: ${error.message}`);
        return false;
    }
}

function executeLegacy(args) {
    const legacyPath = path.join(__dirname, 'split-facets.legacy.js');
    
    debug(`Attempting legacy execution: ${legacyPath}`);
    
    if (!fs.existsSync(legacyPath)) {
        debug(`Legacy splitter not found: ${legacyPath}`);
        return false;
    }
    
    try {
        const result = execSync(`node "${legacyPath}" ${args.join(' ')}`, {
            stdio: 'inherit'
        });
        debug('Legacy execution successful');
        return true;
    } catch (error) {
        debug(`Legacy execution failed: ${error.message}`);
        return false;
    }
}

function main() {
    const args = process.argv.slice(2);
    
    debug(`Facet splitter shim starting with args: [${args.join(', ')}]`);
    debug(`USE_LEGACY: ${USE_LEGACY}, DEBUG: ${DEBUG}`);
    
    // Force legacy if requested
    if (USE_LEGACY) {
        debug('Forced legacy mode via SPLITTER_USE_LEGACY=1');
        if (executeLegacy(args)) {
            process.exit(0);
        } else {
            console.error('ERROR: Legacy splitter execution failed');
            process.exit(1);
        }
    }
    
    // Three-tier fallback chain
    debug('Starting fallback chain: built JS → ts-node → legacy');
    
    // Tier 1: Built JavaScript (production)
    if (executeBuiltJS(args)) {
        process.exit(0);
    }
    
    // Tier 2: ts-node execution (development)
    if (executeTsNode(args)) {
        process.exit(0);
    }
    
    // Tier 3: Legacy AST splitter (rollback)
    if (executeLegacy(args)) {
        process.exit(0);
    }
    
    // All fallbacks failed
    console.error('ERROR: All splitter execution methods failed');
    console.error('Available fallbacks: built JS, ts-node, legacy AST');
    console.error('Check SPLITTER_DEBUG=1 for detailed diagnostics');
    process.exit(1);
}

// Execute main function
if (require.main === module) {
    main();
}

module.exports = { main };
