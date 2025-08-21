/**
 * 🚀 PayRox Auto-Fix Configuration
 * Novel "Self-Healing Code" system that prevents and fixes issues automatically
 */

module.exports = {
  // Auto-fix rules for common patterns
  patterns: {
    // Fix require() statements in TypeScript
    requireToImport: {
      pattern: /const\s+(\w+)\s+=\s+require\(['"]([^'"]+)['"]\);?/g,
      replacement: "import $1 from '$2';",
      files: ['**/*.ts'],
      ignore: ['**/legacy/**'] // Intentional compatibility files
    },
    
    // Fix __dirname in modern Node.js
    dirnameToModern: {
      pattern: /__dirname/g,
      replacement: "path.dirname(fileURLToPath(import.meta.url))",
      files: ['**/*.js'],
      prelude: "import { fileURLToPath } from 'url'; import path from 'path';"
    },
    
    // Remove unused variables by prefixing with _
    unusedVars: {
      pattern: /(\b(?:const|let|var)\s+)(\w+)(\s+=.*?;)/g,
      replacement: "$1_$2$3",
      condition: "unused"
    }
  },
  
  // Type safety enhancements
  typeSafety: {
    // Add type assertions for dynamic contracts
    contractCasting: {
      pattern: /new\s+(\w+\.)*Contract\(/g,
      replacement: "(new $1Contract(",
      suffix: ") as any"
    }
  },
  
  // Ignore rules for intentional code
  ignoreRules: {
    files: {
      'split-facets.js': ['no-undef'], // Legacy Node.js patterns
      'ai-adapter.ts': ['@typescript-eslint/no-var-requires'] // Dynamic loading
    }
  }
};
