#!/usr/bin/env node
/**
 * PERMANENT ERROR DETECTION AND SOURCE IDENTIFICATION TOOL
 * 
 * This script runs all quality checks and provides a comprehensive
 * report of all errors with their root causes and fix suggestions.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ErrorDetector {
  constructor() {
    this.results = {
      typescript: { errors: [], count: 0 },
      eslint: { errors: [], count: 0 },
      dependencies: { errors: [], count: 0 },
      tests: { errors: [], count: 0 },
      ci: { errors: [], count: 0 }
    };
    this.timestamp = new Date().toISOString();
  }

  async runAllChecks() {
    console.log('🔍 Running comprehensive error detection...\n');
    
    await this.checkDependencies();
    await this.checkTypeScript();
    await this.checkESLint();
    await this.checkTests();
    await this.checkCIReadiness();
    
    this.generateReport();
    this.saveDiagnostics();
  }

  async checkDependencies() {
    console.log('📦 Checking dependencies...');
    
    try {
      // Check for package-lock sync issues first
      execSync('npm ci --dry-run', { stdio: 'pipe' });
      console.log('✅ Dependencies: Lock file in sync');
    } catch (error) {
      const output = error.stdout ? error.stdout.toString() : error.stderr ? error.stderr.toString() : '';
      
      if (output.includes('lock file') || output.includes('does not satisfy') || output.includes('Missing:')) {
        this.results.dependencies.errors.push({
          type: 'LOCK_FILE_SYNC',
          message: 'package-lock.json is out of sync with package.json',
          fix: 'Run: npm install --package-lock-only',
          severity: 'HIGH'
        });
        this.results.dependencies.count++;
        console.log('❌ Dependencies: Lock file out of sync');
        return;
      }
    }
    
    try {
      // Check for general dependency issues
      execSync('npm install --dry-run', { stdio: 'pipe' });
      console.log('✅ Dependencies: OK');
    } catch (error) {
      this.results.dependencies.errors.push({
        type: 'DEPENDENCY_CONFLICT',
        message: error.message,
        source: 'package.json',
        fix: 'Update conflicting package versions'
      });
      this.results.dependencies.count++;
      console.log('❌ Dependencies: FAILED');
    }
  }

  async checkTypeScript() {
    console.log('🔷 Checking TypeScript compilation...');
    try {
      execSync('npx tsc -p tsconfig.hardhat.json --noEmit', { 
        stdio: 'pipe', 
        encoding: 'utf8' 
      });
      console.log('✅ TypeScript: OK');
    } catch (error) {
      let output = '';
      if (error.stdout) {
        output = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : error.stdout;
      } else if (error.stderr) {
        output = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : error.stderr;
      }
      
      // Find all lines that contain TypeScript errors
      const errorLines = output.split('\n').filter(line => 
        line.includes('.ts(') && line.includes('): error TS')
      );
      
      errorLines.forEach(line => {
        // Match TypeScript error format with working pattern
        const match = line.match(/(.+\.ts)\((\d+),(\d+)\): error TS(\d+): (.+)/);
        if (match) {
          const [, file, lineNum, col, errorCode, message] = match;
          this.results.typescript.errors.push({
            type: 'TYPE_ERROR',
            file: file.replace(process.cwd(), '').replace(/\\/g, '/'),
            line: lineNum,
            column: col,
            errorCode: `TS${errorCode}`,
            message: message.replace(/\r$/, '').trim(),
            category: this.categorizeTypeError(message),
            fix: this.suggestTypeFix(message)
          });
          this.results.typescript.count++;
        }
      });
      
      console.log(`❌ TypeScript: ${this.results.typescript.count} errors`);
    }
  }

  async checkESLint() {
    console.log('🔧 Checking ESLint...');
    try {
      execSync('npm run lint:check', { stdio: 'pipe', encoding: 'utf8' });
      console.log('✅ ESLint: OK');
    } catch (error) {
      let output = '';
      if (error.stdout) {
        output = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : error.stdout;
      } else if (error.stderr) {
        output = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : error.stderr;
      }
      
      const lines = output.split('\n');
      let currentFile = '';
      
      lines.forEach(line => {
        // Check if this is a file path line
        if (line.match(/^[A-Z]:\\.+\.(ts|js)$/)) {
          currentFile = line.replace(process.cwd(), '');
          return;
        }
        
        // Check if this is an error line
        const errorMatch = line.match(/^\s*(\d+):(\d+)\s+error\s+(.+?)\s+(@[\w-]+\/[\w-]+|[\w-]+)$/);
        if (errorMatch && currentFile) {
          const [, lineNum, col, message, rule] = errorMatch;
          
          this.results.eslint.errors.push({
            type: 'LINT_ERROR',
            file: currentFile,
            line: lineNum,
            column: col,
            message: message.trim(),
            rule: rule.trim(),
            category: this.categorizeLintError(rule),
            fix: this.suggestLintFix(rule.trim())
          });
          this.results.eslint.count++;
        }
      });
      
      console.log(`❌ ESLint: ${this.results.eslint.count} errors`);
    }
  }

  async checkTests() {
    console.log('🧪 Checking test configuration...');
    try {
      // Check if Jest config is valid
      const jestConfig = require(path.join(process.cwd(), 'jest.config.js'));
      console.log('✅ Tests: Configuration OK');
    } catch (error) {
      this.results.tests.errors.push({
        type: 'TEST_CONFIG_ERROR',
        message: error.message,
        fix: 'Fix Jest configuration'
      });
      this.results.tests.count++;
      console.log('❌ Tests: Configuration error');
    }
  }

  async checkCIReadiness() {
    console.log('🚀 Checking CI readiness...');
    const ciWorkflow = path.join(process.cwd(), '.github/workflows/quality-gates.yml');
    
    if (!fs.existsSync(ciWorkflow)) {
      this.results.ci.errors.push({
        type: 'MISSING_CI_WORKFLOW',
        message: 'Quality gates workflow not found',
        fix: 'Create .github/workflows/quality-gates.yml'
      });
      this.results.ci.count++;
    }

    // Check if package.json has required scripts
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredScripts = ['lint', 'lint:check', 'check:ts', 'lint:zero'];
    
    requiredScripts.forEach(script => {
      if (!pkg.scripts[script]) {
        this.results.ci.errors.push({
          type: 'MISSING_SCRIPT',
          message: `Required script '${script}' not found`,
          fix: `Add "${script}" script to package.json`
        });
        this.results.ci.count++;
      }
    });

    if (this.results.ci.count === 0) {
      console.log('✅ CI: Ready');
    } else {
      console.log(`❌ CI: ${this.results.ci.count} issues`);
    }
  }

  categorizeTypeError(message) {
    if (message.includes('possibly \'undefined\'') || message.includes('Object is possibly \'undefined\'')) {
      return 'NULL_SAFETY';
    }
    if (message.includes('Cannot find module') || message.includes('Cannot find name')) {
      return 'MISSING_IMPORT';
    }
    if (message.includes('not assignable to parameter')) {
      return 'TYPE_MISMATCH';
    }
    if (message.includes('implicitly has an \'any\' type')) {
      return 'IMPLICIT_ANY';
    }
    return 'OTHER';
  }

  categorizeLintError(rule) {
    if (rule.includes('no-unused-vars')) return 'UNUSED_VARIABLES';
    if (rule.includes('no-floating-promises')) return 'ASYNC_ISSUES';
    if (rule.includes('consistent-type-assertions')) return 'TYPE_STYLE';
    if (rule.includes('no-useless-constructor')) return 'CODE_STYLE';
    if (rule.includes('no-extraneous-class')) return 'CLASS_DESIGN';
    if (rule.includes('return-await')) return 'ASYNC_STYLE';
    if (rule.includes('no-unused-expressions')) return 'UNUSED_CODE';
    return 'OTHER';
  }

  suggestTypeFix(message) {
    if (message.includes('possibly \'undefined\'')) {
      return 'Add null check: if (variable) { ... } or use optional chaining: variable?.method()';
    }
    if (message.includes('Cannot find module')) {
      return 'Add missing import or install missing dependency';
    }
    if (message.includes('not assignable to parameter')) {
      return 'Fix type mismatch by adding type assertion or updating types';
    }
    if (message.includes('implicitly has an \'any\' type')) {
      return 'Add explicit type annotation';
    }
    return 'Review TypeScript error and fix accordingly';
  }

  suggestLintFix(rule) {
    const fixes = {
      '@typescript-eslint/no-unused-vars': 'Prefix unused variables with underscore (_variable) or remove them',
      '@typescript-eslint/no-floating-promises': 'Add void operator or .catch() handler to promise',
      '@typescript-eslint/consistent-type-assertions': 'Use "as Type" instead of "<Type>"',
      '@typescript-eslint/no-useless-constructor': 'Remove empty constructor or add meaningful logic',
      '@typescript-eslint/no-extraneous-class': 'Convert utility class to functions or add instance methods',
      '@typescript-eslint/return-await': 'Remove await from return statement',
      'no-unused-expressions': 'Remove unused expression or assign to variable'
    };
    return fixes[rule] || 'Check ESLint documentation for this rule';
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE ERROR REPORT');
    console.log('='.repeat(80));
    
    const totalErrors = Object.values(this.results).reduce((sum, category) => sum + category.count, 0);
    
    console.log(`\n🎯 SUMMARY:`);
    console.log(`   Total Errors: ${totalErrors}`);
    console.log(`   TypeScript: ${this.results.typescript.count}`);
    console.log(`   ESLint: ${this.results.eslint.count}`);
    console.log(`   Dependencies: ${this.results.dependencies.count}`);
    console.log(`   Tests: ${this.results.tests.count}`);
    console.log(`   CI: ${this.results.ci.count}`);

    if (this.results.typescript.count > 0) {
      console.log(`\n🔷 TYPESCRIPT ERRORS BY CATEGORY:`);
      const categories = {};
      this.results.typescript.errors.forEach(error => {
        categories[error.category] = (categories[error.category] || 0) + 1;
      });
      Object.entries(categories).forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count}`);
      });
    }

    if (this.results.eslint.count > 0) {
      console.log(`\n🔧 ESLINT ERRORS BY RULE:`);
      const rules = {};
      this.results.eslint.errors.forEach(error => {
        rules[error.rule] = (rules[error.rule] || 0) + 1;
      });
      Object.entries(rules).forEach(([rule, count]) => {
        console.log(`   ${rule}: ${count}`);
      });
    }

    console.log(`\n📋 RECOMMENDED ACTIONS:`);
    
    if (this.results.dependencies.count > 0) {
      console.log(`   1. Fix dependency conflicts in package.json`);
    }
    
    if (this.results.typescript.count > 0) {
      console.log(`   2. Address TypeScript null safety issues (add ? operators)`);
      console.log(`   3. Fix missing imports and type declarations`);
      console.log(`   4. Add explicit type annotations where needed`);
    }
    
    if (this.results.eslint.count > 0) {
      console.log(`   5. Prefix unused variables with underscore`);
      console.log(`   6. Add promise error handling`);
      console.log(`   7. Fix style inconsistencies`);
    }

    console.log(`\n💾 Full diagnostic saved to: .quality/error-report-${this.timestamp.slice(0,10)}.json`);
  }

  saveDiagnostics() {
    const qualityDir = path.join(process.cwd(), '.quality');
    if (!fs.existsSync(qualityDir)) {
      fs.mkdirSync(qualityDir, { recursive: true });
    }

    const reportFile = path.join(qualityDir, `error-report-${this.timestamp.slice(0,10)}.json`);
    const report = {
      timestamp: this.timestamp,
      summary: {
        totalErrors: Object.values(this.results).reduce((sum, category) => sum + category.count, 0),
        byCategory: Object.fromEntries(
          Object.entries(this.results).map(([key, value]) => [key, value.count])
        )
      },
      details: this.results,
      recommendations: this.generateRecommendations()
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  }

  generateRecommendations() {
    return {
      immediate: [
        'Fix dependency conflicts to ensure CI passes',
        'Address TypeScript null safety errors',
        'Prefix unused variables with underscore'
      ],
      strategic: [
        'Implement strict null checks in tsconfig.json',
        'Add pre-commit hooks for quality gates',
        'Create automated error fixing scripts'
      ],
      prevention: [
        'Use strict TypeScript configuration',
        'Enforce code review for type safety',
        'Monitor error trends over time'
      ]
    };
  }
}

// Run if called directly
if (require.main === module) {
  const detector = new ErrorDetector();
  detector.runAllChecks().catch(console.error);
}

module.exports = ErrorDetector;
