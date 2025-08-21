#!/usr/bin/env node

/**
 * Advanced Error Fixer - Handles complex TypeScript and ESLint errors
 * 
 * This tool fixes harder cases that the basic auto-fixer can't handle:
 * - Missing import statements 
 * - Complex type assertions
 * - Implicit any type annotations
 * - Unused variable removal (vs prefixing)
 * - Useless constructor removal
 * 
 * Usage: npm run error:fix:advanced
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AdvancedErrorFixer {
  constructor() {
    this.results = {
      fixed: [],
      attempted: [],
      failed: [],
      skipped: []
    };
    this.dryRun = process.argv.includes('--dry-run');
    this.interactive = process.argv.includes('--interactive');
  }

  async run() {
    console.log('🎯 Advanced Error Fixer');
    console.log('='.repeat(50));
    
    if (this.dryRun) {
      console.log('🔍 DRY RUN MODE - No files will be modified');
    }
    
    try {
      const errors = await this.detectErrors();
      
      // Focus on the harder error categories
      await this.fixUnusedVariables(errors.eslint);
      await this.fixUselessConstructors(errors.eslint);
      await this.fixTypeAssertions(errors.eslint);
      await this.fixMissingImports(errors.typescript);
      await this.fixImplicitAnyTypes(errors.typescript);
      
      this.generateReport();
    } catch (error) {
      console.error('❌ Critical error:', error.message);
      process.exit(1);
    }
  }

  async detectErrors() {
    console.log('\n🔍 Detecting advanced errors...');
    
    const errors = { typescript: [], eslint: [] };

    // Get TypeScript errors (same as basic fixer)
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

    // Get ESLint errors (same as basic fixer)
    try {
      execSync('npm run lint:check', { stdio: 'pipe' });
    } catch (error) {
      const output = error.stdout ? error.stdout.toString() : error.stderr ? error.stderr.toString() : '';
      const lines = output.split('\n');
      let currentFile = '';
      
      lines.forEach(line => {
        if (line.match(/^[A-Z]:\\.+\.(ts|js)$/)) {
          currentFile = line.replace(process.cwd(), '').replace(/\\/g, '/').replace(/^\//, '');
          return;
        }
        
        const errorMatch = line.match(/^\s*(\d+):(\d+)\s+error\s+(.+?)\s+(@[\w-]+\/[\w-]+|[\w-]+)$/);
        if (errorMatch && currentFile) {
          const [, lineNum, col, message, rule] = errorMatch;
          errors.eslint.push({
            file: currentFile,
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

  async fixUnusedVariables(eslintErrors) {
    console.log('\n🗑️  Fixing unused variables (removal strategy)...');
    
    const unusedVarErrors = eslintErrors.filter(e => e.rule === '@typescript-eslint/no-unused-vars');
    const errorsByFile = this.groupErrorsByFile(unusedVarErrors);
    
    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      await this.removeUnusedVariablesInFile(filePath, errors);
    }
  }

  async removeUnusedVariablesInFile(filePath, errors) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.results.failed.push(`File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let lines = content.split('\n');
    let modified = false;

    for (const error of errors) {
      const line = lines[error.line - 1];
      const varName = this.extractVariableName(line, error.message);
      
      if (varName && this.canSafelyRemoveVariable(line, varName)) {
        const newLine = this.removeVariableFromLine(line, varName);
        if (newLine !== line) {
          lines[error.line - 1] = newLine;
          modified = true;
          this.results.fixed.push(`${filePath}:${error.line} - Removed unused variable '${varName}'`);
        }
      } else {
        this.results.skipped.push(`${filePath}:${error.line} - Cannot safely remove '${varName}'`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  extractVariableName(line, errorMessage) {
    // Extract variable name from error message like "'varName' is defined but never used"
    const match = errorMessage.match(/'([^']+)' is defined but never used/);
    return match ? match[1] : null;
  }

  canSafelyRemoveVariable(line, varName) {
    // Only remove if it's a simple variable declaration that can be safely removed
    const patterns = [
      // const varName = value;
      new RegExp(`^\\s*const\\s+${varName}\\s*=`),
      // let varName = value;
      new RegExp(`^\\s*let\\s+${varName}\\s*=`),
      // function parameter that's not used
      new RegExp(`\\(\\s*${varName}\\s*[,\\)]`),
    ];
    
    return patterns.some(pattern => pattern.test(line));
  }

  removeVariableFromLine(line, varName) {
    // Remove variable declaration
    if (line.includes(`const ${varName}`) || line.includes(`let ${varName}`)) {
      // If it's the only variable on the line, remove the whole line
      const simpleDeclaration = new RegExp(`^\\s*(const|let)\\s+${varName}\\s*=.*$`);
      if (simpleDeclaration.test(line)) {
        return ''; // Remove entire line
      }
    }
    
    // Remove from parameter list
    const paramPattern = new RegExp(`\\s*,?\\s*${varName}\\s*,?`);
    return line.replace(paramPattern, '');
  }

  async fixUselessConstructors(eslintErrors) {
    console.log('\n🏗️  Fixing useless constructors...');
    
    const constructorErrors = eslintErrors.filter(e => e.rule === '@typescript-eslint/no-useless-constructor');
    const errorsByFile = this.groupErrorsByFile(constructorErrors);
    
    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      await this.removeUselessConstructorsInFile(filePath, errors);
    }
  }

  async removeUselessConstructorsInFile(filePath, errors) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.results.failed.push(`File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let lines = content.split('\n');
    let modified = false;

    // Sort by line number descending to avoid line shift issues
    errors.sort((a, b) => b.line - a.line);

    for (const error of errors) {
      const startLine = error.line - 1;
      const removed = this.removeConstructorLines(lines, startLine);
      
      if (removed > 0) {
        modified = true;
        this.results.fixed.push(`${filePath}:${error.line} - Removed useless constructor`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  removeConstructorLines(lines, startLine) {
    const line = lines[startLine];
    
    // Single line constructor: constructor() {}
    if (line.includes('constructor(') && line.includes('{}')) {
      lines.splice(startLine, 1);
      return 1;
    }
    
    // Multi-line constructor
    if (line.includes('constructor(')) {
      let endLine = startLine;
      let braceCount = 0;
      let started = false;
      
      for (let i = startLine; i < lines.length; i++) {
        const currentLine = lines[i];
        
        for (const char of currentLine) {
          if (char === '{') {
            braceCount++;
            started = true;
          } else if (char === '}') {
            braceCount--;
          }
        }
        
        if (started && braceCount === 0) {
          endLine = i;
          break;
        }
      }
      
      // Check if constructor is empty (only whitespace between braces)
      const constructorBody = lines.slice(startLine, endLine + 1).join('\n');
      const bodyContent = constructorBody.replace(/constructor\s*\([^)]*\)\s*\{/, '').replace(/\}[^}]*$/, '').trim();
      
      if (!bodyContent) {
        const removedLines = endLine - startLine + 1;
        lines.splice(startLine, removedLines);
        return removedLines;
      }
    }
    
    return 0;
  }

  async fixTypeAssertions(eslintErrors) {
    console.log('\n🎭 Fixing type assertions...');
    
    const assertionErrors = eslintErrors.filter(e => e.rule === '@typescript-eslint/consistent-type-assertions');
    const errorsByFile = this.groupErrorsByFile(assertionErrors);
    
    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      await this.fixTypeAssertionsInFile(filePath, errors);
    }
  }

  async fixTypeAssertionsInFile(filePath, errors) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.results.failed.push(`File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let lines = content.split('\n');
    let modified = false;

    for (const error of errors) {
      const line = lines[error.line - 1];
      const newLine = this.convertTypeAssertion(line);
      
      if (newLine && newLine !== line) {
        lines[error.line - 1] = newLine;
        modified = true;
        this.results.fixed.push(`${filePath}:${error.line} - Fixed type assertion`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  convertTypeAssertion(line) {
    // Convert <Type>value to value as Type with better pattern matching
    const patterns = [
      // <Type>value pattern
      {
        pattern: /(\s*)(<\w+>)(\s*)(\w+|[^;]+)/,
        convert: (match) => {
          const [, indent, typeTag, space, value] = match;
          const type = typeTag.slice(1, -1);
          return `${indent}${value.trim()} as ${type}`;
        }
      },
      // More complex: <Type>(expression)
      {
        pattern: /(<\w+>)\(([^)]+)\)/,
        convert: (match) => {
          const [, typeTag, expression] = match;
          const type = typeTag.slice(1, -1);
          return `(${expression}) as ${type}`;
        }
      }
    ];

    for (const { pattern, convert } of patterns) {
      const match = line.match(pattern);
      if (match) {
        return line.replace(pattern, convert(match));
      }
    }

    return null;
  }

  async fixMissingImports(typescriptErrors) {
    console.log('\n📦 Analyzing missing imports...');
    
    const importErrors = typescriptErrors.filter(e => 
      e.message.includes('Cannot find module') || e.message.includes('Cannot find name')
    );
    
    const missingModules = new Set();
    const missingNames = new Set();
    
    importErrors.forEach(error => {
      if (error.message.includes('Cannot find module')) {
        const match = error.message.match(/Cannot find module '(.+)'/);
        if (match) {
          missingModules.add(match[1]);
        }
      } else if (error.message.includes('Cannot find name')) {
        const match = error.message.match(/Cannot find name '(.+)'/);
        if (match) {
          missingNames.add(match[1]);
        }
      }
    });

    console.log(`📋 Missing modules: ${Array.from(missingModules).join(', ')}`);
    console.log(`📋 Missing names: ${Array.from(missingNames).join(', ')}`);
    
    // Provide suggestions rather than automatic fixes for imports
    this.results.skipped.push(`${missingModules.size} missing modules need manual import resolution`);
    this.results.skipped.push(`${missingNames.size} missing names need manual import or declaration`);
  }

  async fixImplicitAnyTypes(typescriptErrors) {
    console.log('\n📝 Analyzing implicit any types...');
    
    const anyErrors = typescriptErrors.filter(e => 
      e.message.includes('implicitly has an \'any\' type')
    );
    
    console.log(`📋 Found ${anyErrors.length} implicit any types requiring manual annotation`);
    this.results.skipped.push(`${anyErrors.length} implicit any types need manual type annotations`);
  }

  groupErrorsByFile(errors) {
    const errorsByFile = {};
    errors.forEach(error => {
      if (!errorsByFile[error.file]) {
        errorsByFile[error.file] = [];
      }
      errorsByFile[error.file].push(error);
    });
    return errorsByFile;
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 ADVANCED ERROR FIXING REPORT');
    console.log('='.repeat(50));
    
    console.log(`\n✅ FIXES APPLIED: ${this.results.fixed.length}`);
    if (this.results.fixed.length > 0) {
      this.results.fixed.forEach(fix => console.log(`   • ${fix}`));
    }
    
    console.log(`\n⚠️  MANUAL REVIEW NEEDED: ${this.results.skipped.length}`);
    if (this.results.skipped.length > 0) {
      this.results.skipped.forEach(skip => console.log(`   • ${skip}`));
    }
    
    console.log(`\n❌ FAILED: ${this.results.failed.length}`);
    if (this.results.failed.length > 0) {
      this.results.failed.forEach(fail => console.log(`   • ${fail}`));
    }
    
    console.log('\n💡 RECOMMENDED NEXT STEPS:');
    console.log('   1. Run: npm run error:detect (check remaining errors)');
    console.log('   2. Review and test the automatic fixes');
    console.log('   3. Manually handle remaining type annotations');
    console.log('   4. Add missing imports where needed');
    console.log('   5. Commit the fixes: git add -A && git commit');
    
    if (this.dryRun) {
      console.log('\n🔍 This was a DRY RUN - no files were modified');
    }
  }
}

// CLI handling
if (require.main === module) {
  const fixer = new AdvancedErrorFixer();
  fixer.run().catch(console.error);
}

module.exports = AdvancedErrorFixer;
