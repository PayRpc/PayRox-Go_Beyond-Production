#!/usr/bin/env node
/**
 * 🚀 PayRox Auto-Fix Runner
 * Actively applies auto-fix patterns from config to prevent crashes and issues
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const config = require('./auto-fix-config.js');

class AutoFixRunner {
  constructor() {
    this.fixes = 0;
    this.errors = 0;
    this.dryRun = process.argv.includes('--dry-run');
    this.verbose = process.argv.includes('--verbose');
  }

  log(message, force = false) {
    if (this.verbose || force) {
      console.log(`🔧 ${message}`);
    }
  }

  async run() {
    this.log('Starting auto-fix scan...', true);

    // Apply pattern fixes
    await this.applyPatternFixes();

    // Check for empty files and fix them
    await this.fixEmptyFiles();

    // Fix common TypeScript issues
    await this.fixTypeScriptIssues();

    // Summary
    console.log(`\n✅ Auto-fix complete: ${this.fixes} fixes applied, ${this.errors} errors`);
    if (this.dryRun) {
      console.log('📋 (Dry run - no files were modified)');
    }
  }

  async applyPatternFixes() {
    for (const [name, pattern] of Object.entries(config.patterns)) {
      this.log(`Applying pattern: ${name}`);

      for (const filePattern of pattern.files || ['**/*.ts', '**/*.js']) {
        const files = glob.sync(filePattern, {
          ignore: ['node_modules/**', 'artifacts/**', 'typechain-types/**', ...(pattern.ignore || [])]
        });

        for (const file of files) {
          await this.applyPatternToFile(file, pattern);
        }
      }
    }
  }

  async applyPatternToFile(filePath, pattern) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;

      // Apply the pattern replacement
      content = content.replace(pattern.pattern, pattern.replacement);

      // Add prelude if needed and changes were made
      if (pattern.prelude && content !== originalContent && !content.includes(pattern.prelude)) {
        content = pattern.prelude + '\n' + content;
      }

      if (content !== originalContent) {
        this.log(`Fixed ${filePath}`);
        this.fixes++;

        if (!this.dryRun) {
          fs.writeFileSync(filePath, content);
        }
      }
    } catch (error) {
      this.log(`Error processing ${filePath}: ${error.message}`);
      this.errors++;
    }
  }

  async fixEmptyFiles() {
    this.log('Checking for empty files...');

    const patterns = ['**/*.sol', '**/*.ts', '**/*.js'];
    const files = patterns.flatMap(p => glob.sync(p, {
      ignore: ['node_modules/**', 'artifacts/**', 'typechain-types/**']
    }));

    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        if (stat.size === 0) {
          this.log(`Fixing empty file: ${file}`, true);
          this.fixes++;

          if (!this.dryRun) {
            const ext = path.extname(file);
            let template = '';

            if (ext === '.sol') {
              template = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title ${path.basename(file, ext)}
 * @dev Auto-recovered empty file
 */
contract ${path.basename(file, ext)} {
    // TODO: Implement contract logic
}
`;
            } else if (ext === '.ts') {
              template = `/**
 * @file ${path.basename(file)}
 * @description Auto-recovered empty file
 */

// TODO: Implement module logic
export {};
`;
            } else if (ext === '.js') {
              template = `/**
 * @file ${path.basename(file)}
 * @description Auto-recovered empty file
 */

// TODO: Implement module logic
module.exports = {};
`;
            }

            fs.writeFileSync(file, template);
          }
        }
      } catch (error) {
        this.log(`Error checking ${file}: ${error.message}`);
        this.errors++;
      }
    }
  }

  async fixTypeScriptIssues() {
    this.log('Fixing common TypeScript issues...');

    const tsFiles = glob.sync('**/*.ts', {
      ignore: ['node_modules/**', 'artifacts/**', 'typechain-types/**']
    });

    for (const file of tsFiles) {
      try {
        let content = fs.readFileSync(file, 'utf8');
        const originalContent = content;

        // Fix missing imports for common utilities
        if (content.includes('path.') && !content.includes('import path')) {
          content = `import path from 'path';\n${content}`;
        }

        if (content.includes('fs.') && !content.includes('import fs')) {
          content = `import fs from 'fs';\n${content}`;
        }

        // Fix contract type casting issues
        content = content.replace(
          /new\s+ethers\.Contract\(/g,
          '(new ethers.Contract('
        );

        if (content.includes('(new ethers.Contract(') && !content.includes(') as any')) {
          content = content.replace(
            /\(new ethers\.Contract\([^)]+\)\)/g,
            '$&) as any'
          );
        }

        if (content !== originalContent) {
          this.log(`Fixed TypeScript issues in ${file}`);
          this.fixes++;

          if (!this.dryRun) {
            fs.writeFileSync(file, content);
          }
        }
      } catch (error) {
        this.log(`Error processing TypeScript file ${file}: ${error.message}`);
        this.errors++;
      }
    }
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new AutoFixRunner();
  runner.run().catch(console.error);
}

module.exports = AutoFixRunner;
