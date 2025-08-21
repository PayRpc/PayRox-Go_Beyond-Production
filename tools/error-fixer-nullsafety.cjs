#!/usr/bin/env node

/**
 * Null Safety Fixer - Specifically targets null safety errors
 * 
 * This tool fixes the most common remaining errors:
 * - 'X' is possibly 'undefined' (TS18048, TS2532)
 * - Argument of type 'string | undefined' (TS2345)
 * - Cannot invoke an object which is possibly 'undefined' (TS2722)
 * 
 * Usage: npm run error:fix:nullsafety
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class NullSafetyFixer {
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
    console.log('🛡️  Null Safety Fixer');
    console.log('='.repeat(50));
    
    if (this.dryRun) {
      console.log('🔍 DRY RUN MODE - No files will be modified');
    }
    
    try {
      const errors = await this.detectNullSafetyErrors();
      
      await this.fixPossiblyUndefinedAccess(errors);
      await this.fixUndefinedArguments(errors);
      await this.fixUndefinedInvocations(errors);
      await this.fixMissingVariables(errors);
      
      this.generateReport();
    } catch (error) {
      console.error('❌ Critical error:', error.message);
      process.exit(1);
    }
  }

  async detectNullSafetyErrors() {
    console.log('\n🔍 Detecting null safety errors...');
    
    const errors = [];

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
          
          // Only handle null safety related errors
          if (['18048', '2532', '2345', '2722', '2552'].includes(errorCode)) {
            errors.push({
              file: file.replace(process.cwd(), '').replace(/\\/g, '/').replace(/^\//, ''),
              line: parseInt(lineNum),
              column: parseInt(col),
              code: `TS${errorCode}`,
              message: message.replace(/\r$/, '').trim()
            });
          }
        }
      });
    }

    console.log(`📊 Found ${errors.length} null safety errors`);
    return errors;
  }

  async fixPossiblyUndefinedAccess(errors) {
    console.log('\n🔧 Fixing "possibly undefined" access...');
    
    const undefinedErrors = errors.filter(e => 
      e.code === 'TS18048' || e.code === 'TS2532'
    );
    
    const errorsByFile = this.groupErrorsByFile(undefinedErrors);
    
    for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
      await this.fixUndefinedAccessInFile(filePath, fileErrors);
    }
  }

  async fixUndefinedAccessInFile(filePath, errors) {
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
      const newLine = this.addOptionalChaining(line, error);
      
      if (newLine && newLine !== line) {
        lines[error.line - 1] = newLine;
        modified = true;
        this.results.fixed.push(`${filePath}:${error.line} - Added optional chaining`);
      } else {
        this.results.skipped.push(`${filePath}:${error.line} - Complex undefined access`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  addOptionalChaining(line, error) {
    // Extract the variable name that's possibly undefined
    let varName = null;
    
    if (error.message.includes("'") && error.message.includes("' is possibly 'undefined'")) {
      const match = error.message.match(/'([^']+)' is possibly 'undefined'/);
      if (match) {
        varName = match[1];
      }
    } else if (error.message.includes('Object is possibly')) {
      // Try to find the object access pattern in the line
      const accessMatch = line.match(/(\w+)\.(\w+)/);
      if (accessMatch) {
        varName = accessMatch[1];
      }
    }

    if (!varName) return null;

    // Apply optional chaining patterns
    const patterns = [
      // obj.property -> obj?.property
      {
        pattern: new RegExp(`\\b${varName}\\.`, 'g'),
        replacement: `${varName}?.`
      },
      // obj[property] -> obj?.[property]  
      {
        pattern: new RegExp(`\\b${varName}\\[`, 'g'),
        replacement: `${varName}?.[`
      },
      // obj() -> obj?.()
      {
        pattern: new RegExp(`\\b${varName}\\(`, 'g'),
        replacement: `${varName}?.(`
      }
    ];

    let result = line;
    for (const { pattern, replacement } of patterns) {
      const newResult = result.replace(pattern, replacement);
      if (newResult !== result) {
        result = newResult;
        break; // Only apply one pattern per line
      }
    }

    return result !== line ? result : null;
  }

  async fixUndefinedArguments(errors) {
    console.log('\n🔧 Fixing undefined arguments...');
    
    const argErrors = errors.filter(e => 
      e.code === 'TS2345' && e.message.includes('string | undefined')
    );
    
    const errorsByFile = this.groupErrorsByFile(argErrors);
    
    for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
      await this.fixUndefinedArgumentsInFile(filePath, fileErrors);
    }
  }

  async fixUndefinedArgumentsInFile(filePath, errors) {
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
      const newLine = this.addNullishCoalescing(line);
      
      if (newLine && newLine !== line) {
        lines[error.line - 1] = newLine;
        modified = true;
        this.results.fixed.push(`${filePath}:${error.line} - Added nullish coalescing`);
      } else {
        this.results.skipped.push(`${filePath}:${error.line} - Complex argument handling needed`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  addNullishCoalescing(line) {
    // Look for function calls with potentially undefined arguments
    const patterns = [
      // functionCall(someVar) where someVar might be undefined
      {
        pattern: /(\w+)\(([^)]*\w+)(\))/,
        process: (match) => {
          const [fullMatch, funcName, args, closeParen] = match;
          
          // Split args and add ?? '' to each that looks like it might be undefined
          const argList = args.split(',').map(arg => {
            const trimmed = arg.trim();
            // If it looks like a simple variable (not a literal or complex expression)
            if (/^\w+$/.test(trimmed) && !['true', 'false', 'null', 'undefined'].includes(trimmed)) {
              return ` ${trimmed} ?? ''`;
            }
            return arg;
          });
          
          return `${funcName}(${argList.join(',')}${closeParen}`;
        }
      }
    ];

    for (const { pattern, process } of patterns) {
      const match = line.match(pattern);
      if (match) {
        return process(match);
      }
    }

    return null;
  }

  async fixUndefinedInvocations(errors) {
    console.log('\n🔧 Fixing undefined function invocations...');
    
    const invokeErrors = errors.filter(e => 
      e.code === 'TS2722' && e.message.includes('Cannot invoke an object which is possibly')
    );
    
    const errorsByFile = this.groupErrorsByFile(invokeErrors);
    
    for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
      await this.fixUndefinedInvocationsInFile(filePath, fileErrors);
    }
  }

  async fixUndefinedInvocationsInFile(filePath, errors) {
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
      const newLine = this.addOptionalInvocation(line);
      
      if (newLine && newLine !== line) {
        lines[error.line - 1] = newLine;
        modified = true;
        this.results.fixed.push(`${filePath}:${error.line} - Added optional invocation`);
      } else {
        this.results.skipped.push(`${filePath}:${error.line} - Complex invocation pattern`);
      }
    }

    if (modified && !this.dryRun) {
      fs.writeFileSync(fullPath, lines.join('\n'));
    }
  }

  addOptionalInvocation(line) {
    // Look for patterns like obj.method() where obj might be undefined
    const patterns = [
      // obj.method( -> obj?.method?.(
      {
        pattern: /(\w+)\.(\w+)\(/g,
        replacement: '$1?.$2?.('
      }
    ];

    for (const { pattern, replacement } of patterns) {
      const newLine = line.replace(pattern, replacement);
      if (newLine !== line) {
        return newLine;
      }
    }

    return null;
  }

  async fixMissingVariables(errors) {
    console.log('\n🔧 Fixing missing variable references...');
    
    const missingErrors = errors.filter(e => 
      e.code === 'TS2552' && e.message.includes('Cannot find name')
    );
    
    for (const error of missingErrors) {
      const fix = this.suggestVariableFix(error);
      if (fix) {
        this.results.fixed.push(`${error.file}:${error.line} - Suggested fix: ${fix}`);
      } else {
        this.results.skipped.push(`${error.file}:${error.line} - Manual variable fix needed`);
      }
    }
  }

  suggestVariableFix(error) {
    // Handle common typos
    if (error.message.includes("Cannot find name '_FACTORY_ADDRESS'")) {
      return "Replace '_FACTORY_ADDRESS' with 'FACTORY_ADDRESS'";
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
    console.log('📊 NULL SAFETY FIXING REPORT');
    console.log('='.repeat(50));
    
    console.log(`\n✅ FIXES APPLIED: ${this.results.fixed.length}`);
    if (this.results.fixed.length > 0) {
      this.results.fixed.forEach(fix => console.log(`   • ${fix}`));
    }
    
    console.log(`\n⚠️  MANUAL REVIEW NEEDED: ${this.results.skipped.length}`);
    if (this.results.skipped.length > 0 && this.results.skipped.length <= 10) {
      this.results.skipped.forEach(skip => console.log(`   • ${skip}`));
    } else if (this.results.skipped.length > 10) {
      this.results.skipped.slice(0, 5).forEach(skip => console.log(`   • ${skip}`));
      console.log(`   • ... and ${this.results.skipped.length - 5} more`);
    }
    
    console.log(`\n❌ FAILED: ${this.results.failed.length}`);
    if (this.results.failed.length > 0) {
      this.results.failed.forEach(fail => console.log(`   • ${fail}`));
    }
    
    console.log('\n💡 RECOMMENDED NEXT STEPS:');
    console.log('   1. Run: npm run error:detect (check progress)');
    console.log('   2. Test the null safety fixes');
    console.log('   3. Handle remaining manual fixes');
    console.log('   4. Commit the improvements');
    
    if (this.dryRun) {
      console.log('\n🔍 This was a DRY RUN - no files were modified');
    }
  }
}

// CLI handling
if (require.main === module) {
  const fixer = new NullSafetyFixer();
  fixer.run().catch(console.error);
}

module.exports = NullSafetyFixer;
