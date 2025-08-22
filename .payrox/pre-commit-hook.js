#!/usr/bin/env node
/**
 * 🚀 PayRox Git Hook - Pre-commit Auto-fix
 * Runs auto-fix before commits to prevent crashes and issues
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🔧 Running pre-commit auto-fix...');

try {
  // Run auto-fix
  execSync('node .payrox/auto-fix-runner.js', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });

  // Check if any files were modified
  const status = execSync('git status --porcelain', { encoding: 'utf8' });

  if (status.trim()) {
    console.log('📝 Auto-fix made changes - please review and commit again');
    console.log('Modified files:');
    console.log(status);
    process.exit(1); // Abort commit to let user review changes
  }

  console.log('✅ Pre-commit auto-fix complete');
  process.exit(0);

} catch (error) {
  console.error('❌ Pre-commit auto-fix failed:', error.message);
  process.exit(1);
}
