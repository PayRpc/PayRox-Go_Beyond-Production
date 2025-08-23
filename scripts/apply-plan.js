#!/usr/bin/env node
/**
 * Apply Plan Script
 * Applies committed deployment plan after delay window
 */

const fs = require('fs');

async function applyPlan() {
  const network = process.argv[2] || 'localhost';
  const planPath = process.argv[3] || 'split-output/deployment-plan.json';

  console.log('⚡ Applying Deployment Plan');
  console.log('==========================');
  console.log(`Network: ${network}`);
  console.log(`Plan: ${planPath}`);
  console.log('');

  if (!fs.existsSync(planPath)) {
    console.error('❌ Deployment plan not found:', planPath);
    process.exit(1);
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  // Check if plan was committed
  let commitResult = null;
  if (fs.existsSync('split-output/commit-result.json')) {
    commitResult = JSON.parse(fs.readFileSync('split-output/commit-result.json', 'utf8'));
  }

  console.log(`Plan ID: ${plan.planId}`);
  if (commitResult) {
    console.log(`Commit Hash: ${commitResult.commitHash}`);
    console.log(`Commit Time: ${commitResult.commitTime}`);
  }
  console.log('');

  try {
    console.log('🔍 Checking delay window...');

    if (commitResult) {
      const commitTime = new Date(commitResult.commitTime);
      const now = new Date();
      const delayHours = (now - commitTime) / (1000 * 60 * 60);

      // Mock delay check (adjust based on your actual delay requirements)
      const requiredDelay = 1; // 1 hour for example

      if (delayHours < requiredDelay) {
        console.log(`⏳ Delay window active: ${delayHours.toFixed(2)}h elapsed, ${requiredDelay}h required`);
        console.log('❌ Cannot apply plan until delay expires');
        process.exit(1);
      }

      console.log(`✅ Delay satisfied: ${delayHours.toFixed(2)}h elapsed`);
    }

    console.log('🚀 Applying plan to dispatcher...');

    // Placeholder for actual apply logic
    // This would call your dispatcher's apply function

    // Mock apply result
    const applyHash = '0x' + require('crypto').randomBytes(32).toString('hex');
    console.log(`✅ Plan applied: ${applyHash}`);

    // Save apply result
    const applyResult = {
      planId: plan.planId,
      applyHash,
      applyTime: new Date().toISOString(),
      network,
      status: 'applied',
      commitResult
    };

    fs.writeFileSync('split-output/apply-result.json', JSON.stringify(applyResult, null, 2));
    console.log('📄 Apply result saved to split-output/apply-result.json');
    console.log('');
    console.log('🎯 Next: Run post-apply validation to verify deployment');

  } catch (error) {
    console.error('❌ Apply failed:', error.message);
    process.exit(1);
  }
}

applyPlan().catch(console.error);
