#!/usr/bin/env node

/**
 * Dependency Sync Fixer - Automatically fixes common dependency sync issues
 * 
 * This tool detects and fixes:
 * - package-lock.json sync issues
 * - Version conflicts between package.json and lock file
 * - Missing dependencies in lock file
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DependencySyncFixer {
  constructor() {
    this.results = {
      fixed: [],
      warnings: [],
      errors: []
    };
  }

  async run() {
    console.log('🔧 Dependency Sync Fixer');
    console.log('='.repeat(50));
    
    try {
      await this.checkAndFixLockFile();
      await this.checkAndFixVersionConflicts();
      await this.generateReport();
    } catch (error) {
      console.error('❌ Critical error:', error.message);
      process.exit(1);
    }
  }

  async checkAndFixLockFile() {
    console.log('\n📦 Checking package-lock.json sync...');
    
    try {
      // Test if npm ci would work
      execSync('npm ci --dry-run', { stdio: 'pipe' });
      console.log('✅ Lock file is in sync');
      return;
    } catch (error) {
      const output = error.stdout ? error.stdout.toString() : error.stderr ? error.stderr.toString() : '';
      
      if (output.includes('lock file') || output.includes('does not satisfy') || output.includes('Missing:')) {
        console.log('⚠️  Lock file out of sync - fixing...');
        
        try {
          // Fix lock file sync
          execSync('npm install --package-lock-only', { stdio: 'inherit' });
          this.results.fixed.push('Updated package-lock.json to sync with package.json');
          console.log('✅ Lock file sync fixed');
        } catch (fixError) {
          this.results.errors.push(`Failed to fix lock file sync: ${fixError.message}`);
          console.log('❌ Failed to fix lock file sync');
        }
      }
    }
  }

  async checkAndFixVersionConflicts() {
    console.log('\n🔍 Checking for version conflicts...');
    
    try {
      // Check for specific version conflicts like picomatch
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const lockExists = fs.existsSync('package-lock.json');
      
      if (lockExists) {
        const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
        
        // Check for common problematic packages
        const problematicPackages = ['picomatch', '@typescript-eslint/parser', 'eslint'];
        
        problematicPackages.forEach(pkg => {
          if (packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg]) {
            const expectedVersion = packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg];
            const lockVersion = packageLock.packages?.[`node_modules/${pkg}`]?.version;
            
            if (lockVersion && expectedVersion && !this.versionsMatch(expectedVersion, lockVersion)) {
              this.results.warnings.push(`Version mismatch for ${pkg}: package.json expects ${expectedVersion}, lock file has ${lockVersion}`);
            }
          }
        });
      }
      
      console.log('✅ Version conflict check complete');
    } catch (error) {
      this.results.warnings.push(`Could not check version conflicts: ${error.message}`);
    }
  }

  versionsMatch(expected, actual) {
    // Simple version matching - could be more sophisticated
    const cleanExpected = expected.replace(/[\^~]/, '');
    const cleanActual = actual;
    
    // For semver ranges, just check if they're compatible
    return cleanActual.startsWith(cleanExpected.split('.')[0]);
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 DEPENDENCY SYNC REPORT');
    console.log('='.repeat(50));
    
    if (this.results.fixed.length > 0) {
      console.log('\n✅ FIXES APPLIED:');
      this.results.fixed.forEach(fix => console.log(`   • ${fix}`));
    }
    
    if (this.results.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.results.warnings.forEach(warning => console.log(`   • ${warning}`));
    }
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.results.errors.forEach(error => console.log(`   • ${error}`));
    }
    
    if (this.results.fixed.length === 0 && this.results.warnings.length === 0 && this.results.errors.length === 0) {
      console.log('\n🎉 All dependency sync checks passed!');
    }
    
    console.log('\n💡 NEXT STEPS:');
    console.log('   • Run: npm ci --no-audit --no-fund');
    console.log('   • Run: npm run error:detect');
    console.log('   • Commit updated package-lock.json if changes were made');
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new DependencySyncFixer();
  fixer.run().catch(console.error);
}

module.exports = DependencySyncFixer;
