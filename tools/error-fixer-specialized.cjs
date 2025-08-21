#!/usr/bin/env node

/**
 * Specialized Error Fixer - Handles specific patterns found in the codebase
 * 
 * This tool focuses on specific fixable patterns we discovered:
 * - Function parameters prefixed with underscore (unused)
 * - Variable names that can be safely prefixed
 * - Simple type annotations for common patterns
 * 
 * Usage: npm run error:fix:specialized
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SpecializedErrorFixer {
  constructor() {
    this.results = {
      fixed: [],
      attempted: [],
      failed: [],
      skipped: []
    };
    this.dryRun = process.argv.includes('--dry-run');
  }

  async run() {
    console.log('🎯 Specialized Error Fixer');
    console.log('='.repeat(50));
    
    if (this.dryRun) {
      console.log('🔍 DRY RUN MODE - No files will be modified');
    }
    
    try {
      const errors = await this.detectErrors();
      
      // Fix specific patterns we can handle automatically
      await this.fixUnusedParameters(errors.eslint);
      await this.fixMissingReturnTypes(errors.typescript);
      await this.fixSimpleTypeAnnotations(errors.typescript);
      
      this.generateReport();
    } catch (error) {
      console.error('❌ Critical error:', error.message);
      process.exit(1);
    }
  }

  async detectErrors() {
    console.log('\n🔍 Detecting specialized patterns...');
    
    const errors = { typescript: [], eslint: [] };

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

  async fixUnusedParameters(eslintErrors) {
    console.log('\n🔧 Fixing unused parameters with underscore prefix...');
    
    const unusedParamErrors = eslintErrors.filter(e => 
      e.rule === '@typescript-eslint/no-unused-vars' && 
      e.message.includes('is defined but never used')
    );
    
    const errorsByFile = this.groupErrorsByFile(unusedParamErrors);
    
    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      await this.fixUnusedParametersInFile(filePath, errors);
    }
  }

  async fixUnusedParametersInFile(filePath, errors) {
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
      const varName = this.extractVariableName(error.message);
      
      if (varName && this.isParameterContext(line, varName)) {
        const newLine = this.prefixParameterWithUnderscore(line, varName);
        if (newLine !== line) {
          lines[error.line - 1] = newLine;
          modified = true;
          this.results.fixed.push(`${filePath}:${error.line} - Prefixed parameter '${varName}' with underscore`);
        }
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  extractVariableName(errorMessage) {
    const match = errorMessage.match(/'([^']+)' is defined but never used/);
    return match ? match[1] : null;
  }

  isParameterContext(line, varName) {
    // Check if the variable appears in a function parameter context
    const patterns = [
      // function(param, otherParam)
      new RegExp(`\\(([^)]*\\b${varName}\\b[^)]*)\\)`),
      // (param: Type) =>
      new RegExp(`\\(([^)]*\\b${varName}\\b[^)]*)\\)\\s*=>`),
      // method(param: Type) {
      new RegExp(`\\w+\\s*\\(([^)]*\\b${varName}\\b[^)]*)\\)\\s*\\{`),
    ];
    
    return patterns.some(pattern => pattern.test(line));
  }

  prefixParameterWithUnderscore(line, varName) {
    // Only prefix if not already prefixed
    if (varName.startsWith('_')) {
      return line;
    }
    
    // Replace the parameter name with underscore prefix
    // Be careful to only replace in parameter position, not in the body
    return line.replace(new RegExp(`\\b${varName}\\b(?=\\s*[,:)])`, 'g'), `_${varName}`);
  }

  async fixMissingReturnTypes(typescriptErrors) {
    console.log('\n📤 Fixing missing return type annotations...');
    
    const returnTypeErrors = typescriptErrors.filter(e => 
      e.message.includes('Function lacks ending return statement') ||
      e.message.includes('missing return type')
    );
    
    console.log(`📋 Found ${returnTypeErrors.length} functions needing return type analysis`);
    // This would need sophisticated AST parsing to do safely
    this.results.skipped.push(`${returnTypeErrors.length} return type annotations need manual review`);
  }

  async fixSimpleTypeAnnotations(typescriptErrors) {
    console.log('\n📝 Adding simple type annotations...');
    
    const implicitAnyErrors = typescriptErrors.filter(e => 
      e.message.includes('implicitly has an \'any\' type')
    );
    
    const errorsByFile = this.groupErrorsByFile(implicitAnyErrors);
    
    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      await this.addSimpleTypeAnnotationsInFile(filePath, errors);
    }
  }

  async addSimpleTypeAnnotationsInFile(filePath, errors) {
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
      const newLine = this.addSimpleTypeAnnotation(line, error.message);
      
      if (newLine && newLine !== line) {
        lines[error.line - 1] = newLine;
        modified = true;
        this.results.fixed.push(`${filePath}:${error.line} - Added type annotation`);
      } else {
        this.results.skipped.push(`${filePath}:${error.line} - Complex type annotation needed`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  addSimpleTypeAnnotation(line, errorMessage) {
    // Handle simple cases where we can infer the type easily
    
    // Parameter x implicitly has an 'any' type
    const paramMatch = errorMessage.match(/Parameter '(\w+)' implicitly has an 'any' type/);
    if (paramMatch) {
      const paramName = paramMatch[1];
      
      // Add : any for now (better than implicit any)
      const patterns = [
        {
          pattern: new RegExp(`\\b${paramName}\\b(?=\\s*[,)])`),
          replacement: `${paramName}: any`
        }
      ];
      
      for (const { pattern, replacement } of patterns) {
        if (pattern.test(line)) {
          return line.replace(pattern, replacement);
        }
      }
    }
    
    // Variable 'x' implicitly has an 'any' type
    const variableMatch = errorMessage.match(/Variable '(\w+)' implicitly has an 'any' type/);
    if (variableMatch) {
      const varName = variableMatch[1];
      
      // Try to add : any to variable declarations
      const patterns = [
        {
          pattern: new RegExp(`(let|const|var)\\s+${varName}\\b(?!\\s*:)`),
          replacement: `$1 ${varName}: any`
        }
      ];
      
      for (const { pattern, replacement } of patterns) {
        if (pattern.test(line)) {
          return line.replace(pattern, replacement);
        }
      }
    }
    
    return null;
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
    console.log('📊 SPECIALIZED ERROR FIXING REPORT');
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
    console.log('   1. Run: npm run error:detect (check progress)');
    console.log('   2. Test the parameter fixes');
    console.log('   3. Review type annotations added');
    console.log('   4. Commit incremental fixes');
    
    if (this.dryRun) {
      console.log('\n🔍 This was a DRY RUN - no files were modified');
    }
  }
}

// CLI handling
if (require.main === module) {
  const fixer = new SpecializedErrorFixer();
  fixer.run().catch(console.error);
}

module.exports = SpecializedErrorFixer;
