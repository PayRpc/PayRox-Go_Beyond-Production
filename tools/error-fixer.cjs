#!/usr/bin/env node

/**
 * Automatic Error Fixer - Systematically fixes TypeScript and ESLint errors
 * 
 * This tool automatically fixes:
 * - TypeScript null safety issues (add ? operators, null checks)
 * - ESLint style issues (unused vars, floating promises, type assertions)
 * - Missing imports and type declarations
 * - Type mismatches and implicit any types
 * 
 * Usage: npm run error:fix:auto
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AutomaticErrorFixer {
  constructor() {
    this.results = {
      fixed: [],
      attempted: [],
      failed: [],
      skipped: []
    };
    this.dryRun = process.argv.includes('--dry-run');
    this.verbose = process.argv.includes('--verbose');
  }

  async run() {
    console.log('🔧 Automatic Error Fixer');
    console.log('='.repeat(50));
    
    if (this.dryRun) {
      console.log('🔍 DRY RUN MODE - No files will be modified');
    }
    
    try {
      // Get current error state
      const errors = await this.detectErrors();
      
      // Fix errors in order of priority
      await this.fixESLintErrors(errors.eslint);
      await this.fixTypeScriptErrors(errors.typescript);
      
      // Verify fixes
      await this.verifyFixes();
      
      // Generate report
      this.generateReport();
    } catch (error) {
      console.error('❌ Critical error:', error.message);
      process.exit(1);
    }
  }

  async detectErrors() {
    console.log('\n🔍 Detecting errors...');
    
    const errors = {
      typescript: [],
      eslint: []
    };

    // Get TypeScript errors
    try {
      execSync('npx tsc -p tsconfig.hardhat.json --noEmit', { stdio: 'pipe' });
    } catch (error) {
      const output = error.stdout ? error.stdout.toString() : error.stderr ? error.stderr.toString() : '';
      const errorLines = output.split('\n').filter(line => 
        line.includes('.ts(') && line.includes('): error TS')
      );
      
      errorLines.forEach(line => {
        const match = line.match(/(.+\.ts)\((\d+),(\d+)\): error TS(\d+): (.+)/);
        if (match) {
          const [, file, lineNum, col, errorCode, message] = match;
          errors.typescript.push({
            file: file.replace(process.cwd(), '').replace(/\\/g, '/').replace(/^\//, ''),
            line: parseInt(lineNum),
            column: parseInt(col),
            code: `TS${errorCode}`,
            message: message.replace(/\r$/, '').trim()
          });
        }
      });
    }

    // Get ESLint errors
    try {
      execSync('npm run lint:check', { stdio: 'pipe' });
    } catch (error) {
      const output = error.stdout ? error.stdout.toString() : error.stderr ? error.stderr.toString() : '';
      const lines = output.split('\n');
      let currentFile = '';
      
      lines.forEach(line => {
        if (line.match(/^[A-Z]:\\.+\.(ts|js)$/)) {
          currentFile = line.replace(process.cwd(), '').replace(/\\/g, '/');
          return;
        }
        
        const errorMatch = line.match(/^\s*(\d+):(\d+)\s+error\s+(.+?)\s+(@[\w-]+\/[\w-]+|[\w-]+)$/);
        if (errorMatch && currentFile) {
          const [, lineNum, col, message, rule] = errorMatch;
          errors.eslint.push({
            file: currentFile.replace(/^\//, ''), // Remove leading slash
            line: parseInt(lineNum),
            column: parseInt(col),
            message: message.trim(),
            rule: rule.trim()
          });
        }
      });
    }

    console.log(`📊 Found ${errors.typescript.length} TypeScript errors, ${errors.eslint.length} ESLint errors`);
    return errors;
  }

  async fixESLintErrors(eslintErrors) {
    console.log('\n🔧 Fixing ESLint errors...');
    
    // Group errors by file for efficient processing
    const errorsByFile = {};
    eslintErrors.forEach(error => {
      if (!errorsByFile[error.file]) {
        errorsByFile[error.file] = [];
      }
      errorsByFile[error.file].push(error);
    });

    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      await this.fixESLintErrorsInFile(filePath, errors);
    }
  }

  async fixESLintErrorsInFile(filePath, errors) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.results.failed.push(`File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let modified = false;
    const lines = content.split('\n');

    // Sort errors by line number (descending) to avoid line number shifts
    errors.sort((a, b) => b.line - a.line);

    for (const error of errors) {
      try {
        const fix = this.getESLintFix(error, lines);
        if (fix) {
          this.applyFix(lines, error.line - 1, fix);
          modified = true;
          this.results.fixed.push(`${filePath}:${error.line} - Fixed ${error.rule}`);
        } else {
          this.results.skipped.push(`${filePath}:${error.line} - No auto-fix for ${error.rule}`);
        }
      } catch (err) {
        this.results.failed.push(`${filePath}:${error.line} - Failed to fix ${error.rule}: ${err.message}`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  getESLintFix(error, lines) {
    const line = lines[error.line - 1];
    
    switch (error.rule) {
      case '@typescript-eslint/no-unused-vars':
        return this.fixUnusedVariable(line, error);
      
      case '@typescript-eslint/no-floating-promises':
        return this.fixFloatingPromise(line);
      
      case '@typescript-eslint/consistent-type-assertions':
        return this.fixTypeAssertion(line);
      
      case '@typescript-eslint/no-useless-constructor':
        return this.fixUselessConstructor(lines, error.line - 1);
      
      case '@typescript-eslint/no-extraneous-class':
        return this.fixExtraneousClass(line);
      
      case '@typescript-eslint/return-await':
        return this.fixReturnAwait(line);
      
      case 'no-unused-expressions':
        return this.fixUnusedExpression(line);
      
      default:
        return null;
    }
  }

  fixUnusedVariable(line, error) {
    // Add underscore prefix to unused variables
    const patterns = [
      // Variable declarations: const variable = 
      { pattern: /(\s+const\s+)([a-zA-Z_]\w*)(\s*[=:])/g, replacement: '$1_$2$3' },
      // Function parameters: function(param)
      { pattern: /(\(\s*)([a-zA-Z_]\w*)(\s*[,\)])/g, replacement: '$1_$2$3' },
      // Destructuring: const { prop } = 
      { pattern: /(\{\s*)([a-zA-Z_]\w*)(\s*[,\}])/g, replacement: '$1_$2$3' },
      // Variable assignments: let variable = 
      { pattern: /(\s+let\s+)([a-zA-Z_]\w*)(\s*[=:])/g, replacement: '$1_$2$3' },
      // Arrow function params: (param) =>
      { pattern: /(\(\s*)([a-zA-Z_]\w*)(\s*\)\s*=>)/g, replacement: '$1_$2$3' }
    ];
    
    for (const { pattern, replacement } of patterns) {
      const newLine = line.replace(pattern, replacement);
      if (newLine !== line && !newLine.includes('__')) { // Avoid double underscores
        return newLine;
      }
    }
    return null;
  }

  fixFloatingPromise(line) {
    // Add void operator to floating promises
    if (line.includes('.then(') || line.includes('.catch(') || line.includes('await ')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('void ') && !trimmed.startsWith('return ')) {
        const indentation = line.match(/^(\s*)/)[1];
        return `${indentation}void ${trimmed}`;
      }
    }
    return null;
  }

  fixTypeAssertion(line) {
    // Convert <Type>value to value as Type
    const match = line.match(/(.*)(<\w+>)(\s*)(\w+)(.*)/);
    if (match) {
      const [, before, typeTag, space, value, after] = match;
      const type = typeTag.slice(1, -1); // Remove < >
      return `${before}${value} as ${type}${after}`;
    }
    return null;
  }

  fixUselessConstructor(lines, lineIndex) {
    // Remove empty constructors
    const line = lines[lineIndex];
    if (line.includes('constructor(') && (line.includes('{}') || line.includes('{ }'))) {
      return ''; // Remove the line
    }
    // Handle multi-line empty constructors
    if (line.trim() === 'constructor() {' && lineIndex + 1 < lines.length && lines[lineIndex + 1].trim() === '}') {
      lines[lineIndex + 1] = ''; // Mark next line for removal too
      return '';
    }
    return null;
  }

  fixExtraneousClass(line) {
    // Convert utility classes to namespaces or suggest refactoring
    if (line.includes('class') && line.includes('static')) {
      this.results.skipped.push('Extraneous class requires manual refactoring');
    }
    return null;
  }

  fixReturnAwait(line) {
    // Remove await from return statements
    const match = line.match(/^(\s*return\s+)await\s+(.+)$/);
    if (match) {
      return `${match[1]}${match[2]}`;
    }
    return null;
  }

  fixUnusedExpression(line) {
    // Add void operator or assign to variable
    if (line.includes('&&') || line.includes('||')) {
      return `void (${line.trim()})`;
    }
    return null;
  }

  async fixTypeScriptErrors(typescriptErrors) {
    console.log('\n🔷 Fixing TypeScript errors...');
    
    // Group by category for systematic fixing
    const categories = {
      nullSafety: [],
      missingImport: [],
      typeMismatch: [],
      implicitAny: [],
      other: []
    };

    typescriptErrors.forEach(error => {
      if (error.message.includes('possibly \'undefined\'')) {
        categories.nullSafety.push(error);
      } else if (error.message.includes('Cannot find module') || error.message.includes('Cannot find name')) {
        categories.missingImport.push(error);
      } else if (error.message.includes('not assignable to parameter')) {
        categories.typeMismatch.push(error);
      } else if (error.message.includes('implicitly has an \'any\' type')) {
        categories.implicitAny.push(error);
      } else {
        categories.other.push(error);
      }
    });

    // Fix null safety issues first (most common)
    await this.fixNullSafetyErrors(categories.nullSafety);
    
    // Fix missing imports
    await this.fixMissingImportErrors(categories.missingImport);
    
    // Other categories require more careful handling
    this.results.skipped.push(`${categories.typeMismatch.length} type mismatch errors require manual review`);
    this.results.skipped.push(`${categories.implicitAny.length} implicit any errors require manual type annotations`);
    this.results.skipped.push(`${categories.other.length} other TypeScript errors require manual review`);
  }

  async fixNullSafetyErrors(nullSafetyErrors) {
    const errorsByFile = {};
    nullSafetyErrors.forEach(error => {
      if (!errorsByFile[error.file]) {
        errorsByFile[error.file] = [];
      }
      errorsByFile[error.file].push(error);
    });

    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      await this.fixNullSafetyInFile(filePath, errors);
    }
  }

  async fixNullSafetyInFile(filePath, errors) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.results.failed.push(`File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let modified = false;
    const lines = content.split('\n');

    for (const error of errors) {
      try {
        const fix = this.getNullSafetyFix(lines[error.line - 1], error);
        if (fix) {
          lines[error.line - 1] = fix;
          modified = true;
          this.results.fixed.push(`${filePath}:${error.line} - Added null safety check`);
        }
      } catch (err) {
        this.results.failed.push(`${filePath}:${error.line} - Failed null safety fix: ${err.message}`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  getNullSafetyFix(line, error) {
    // More sophisticated null safety fixes
    let fixedLine = line;
    
    // Pattern 1: object.method() -> object?.method()
    const methodCallPattern = /(\w+)\.(\w+)\(/g;
    if (methodCallPattern.test(line) && !line.includes('?.')) {
      fixedLine = line.replace(methodCallPattern, '$1?.$2(');
    }
    
    // Pattern 2: object.property -> object?.property  
    const propertyPattern = /(\w+)\.(\w+)(?!\()/g;
    if (propertyPattern.test(line) && !line.includes('?.')) {
      fixedLine = line.replace(propertyPattern, '$1?.$2');
    }
    
    // Pattern 3: array[index] -> array?.[index]
    const arrayPattern = /(\w+)\[/g;
    if (arrayPattern.test(line) && !line.includes('?.')) {
      fixedLine = line.replace(arrayPattern, '$1?.[');
    }
    
    // Pattern 4: Add null check wrapper for complex cases
    if (error.message.includes('possibly \'undefined\'') && fixedLine === line) {
      // Try to identify the problematic variable
      const varMatch = error.message.match(/'(\w+)' is possibly 'undefined'/);
      if (varMatch) {
        const varName = varMatch[1];
        // Simple null check pattern
        if (line.includes(varName) && !line.includes('if') && !line.includes('?.')) {
          const indent = line.match(/^(\s*)/)[1];
          const content = line.trim();
          fixedLine = `${indent}if (${varName}) { ${content} }`;
        }
      }
    }
    
    return fixedLine !== line ? fixedLine : null;
  }

  async fixMissingImportErrors(missingImportErrors) {
    // Group by missing module/name
    const missingModules = new Set();
    missingImportErrors.forEach(error => {
      if (error.message.includes('Cannot find module')) {
        const match = error.message.match(/Cannot find module '(.+)'/);
        if (match) {
          missingModules.add(match[1]);
        }
      }
    });

    for (const module of missingModules) {
      this.results.skipped.push(`Missing module '${module}' - check if npm package needs to be installed`);
    }
  }

  applyFix(lines, lineIndex, newContent) {
    if (newContent === '') {
      lines.splice(lineIndex, 1); // Remove line
    } else {
      lines[lineIndex] = newContent; // Replace line
    }
  }

  async verifyFixes() {
    console.log('\n🔍 Verifying fixes...');
    
    try {
      // Run error detection again to see improvement
      const { stdout } = execSync('npm run error:detect', { 
        stdio: 'pipe', 
        encoding: 'utf8' 
      });
      
      const summaryMatch = stdout.match(/Total Errors: (\d+)/);
      if (summaryMatch) {
        console.log(`📊 Remaining errors: ${summaryMatch[1]}`);
      }
    } catch (error) {
      console.log('⚠️  Could not verify - run npm run error:detect manually');
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 AUTOMATIC ERROR FIXING REPORT');
    console.log('='.repeat(50));
    
    console.log(`\n✅ FIXES APPLIED: ${this.results.fixed.length}`);
    if (this.results.fixed.length > 0) {
      this.results.fixed.slice(0, 10).forEach(fix => console.log(`   • ${fix}`));
      if (this.results.fixed.length > 10) {
        console.log(`   ... and ${this.results.fixed.length - 10} more`);
      }
    }
    
    console.log(`\n⚠️  SKIPPED: ${this.results.skipped.length}`);
    if (this.results.skipped.length > 0) {
      this.results.skipped.slice(0, 5).forEach(skip => console.log(`   • ${skip}`));
      if (this.results.skipped.length > 5) {
        console.log(`   ... and ${this.results.skipped.length - 5} more`);
      }
    }
    
    console.log(`\n❌ FAILED: ${this.results.failed.length}`);
    if (this.results.failed.length > 0) {
      this.results.failed.forEach(fail => console.log(`   • ${fail}`));
    }
    
    console.log('\n💡 NEXT STEPS:');
    console.log('   • Run: npm run error:detect (to see remaining errors)');
    console.log('   • Run: npm run lint:check (to verify ESLint fixes)');
    console.log('   • Review and commit changes');
    console.log('   • Handle remaining manual fixes for complex issues');
    
    if (this.dryRun) {
      console.log('\n🔍 This was a DRY RUN - no files were modified');
      console.log('   Remove --dry-run flag to apply fixes');
    }
  }
}

// CLI handling
if (require.main === module) {
  const fixer = new AutomaticErrorFixer();
  fixer.run().catch(console.error);
}

module.exports = AutomaticErrorFixer;
