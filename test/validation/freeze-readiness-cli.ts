/**
 * Command Line Interface for Enhanced Freeze Readiness Assessment
 * 
 * Provides a user-friendly CLI wrapper for the freeze readiness assessment tool
 * with interactive prompts and guided workflows.
 * 
 * Usage: npx hardhat run test/validation/freeze-readiness-cli.ts
 */

import * as readline from 'readline';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CliOptions {
  mode: 'assessment' | 'interactive' | 'monitor' | 'report';
  format: 'console' | 'json' | 'markdown' | 'html';
  network: string;
  simulate: boolean;
  continuous: boolean;
}

class FreezeReadinessCLI {
  private rl: readline.Interface;
  private options: Partial<CliOptions> = {};

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start(): Promise<void> {
    console.log('🔒 PayRox Freeze Readiness Assessment CLI v2.0.0');
    console.log('================================================\n');

    await this.showMainMenu();
  }

  private async showMainMenu(): Promise<void> {
    console.log('📋 Select Assessment Mode:');
    console.log('1. 🎯 Quick Assessment (Simulation)');
    console.log('2. 🔍 Full Assessment (Live)');
    console.log('3. 🎮 Interactive Assessment');
    console.log('4. 📊 Generate Report');
    console.log('5. 📈 Continuous Monitoring');
    console.log('6. ❓ Help & Documentation');
    console.log('7. 🚪 Exit\n');

    const choice = await this.askQuestion('Enter your choice (1-7): ');
    
    switch (choice.trim()) {
      case '1':
        await this.runQuickAssessment();
        break;
      case '2':
        await this.runFullAssessment();
        break;
      case '3':
        await this.runInteractiveAssessment();
        break;
      case '4':
        await this.generateReport();
        break;
      case '5':
        await this.startMonitoring();
        break;
      case '6':
        await this.showHelp();
        break;
      case '7':
        console.log('👋 Goodbye!');
        this.rl.close();
        return;
      default:
        console.log('❌ Invalid choice. Please try again.\n');
        await this.showMainMenu();
    }
  }

  private async runQuickAssessment(): Promise<void> {
    console.log('\n🎯 Running Quick Assessment (Simulation Mode)...\n');
    
    const network = await this.askQuestion('Network (hardhat/localhost/mainnet): ') || 'hardhat';
    
    try {
      await this.executeAssessment({
        simulate: true,
        network,
        format: 'console',
        detailed: true
      });
    } catch (error) {
      console.error('❌ Assessment failed:', error);
    }

    await this.askToContinue();
  }

  private async runFullAssessment(): Promise<void> {
    console.log('\n🔍 Running Full Assessment (Live Mode)...\n');
    
    const network = await this.askQuestion('Network (hardhat/localhost/mainnet): ') || 'hardhat';
    const format = await this.askQuestion('Output format (console/json/markdown/html): ') || 'console';
    
    console.log('⚠️  WARNING: This will assess actual deployment status!');
    const confirm = await this.askQuestion('Continue? (y/N): ');
    
    if (confirm.toLowerCase() === 'y') {
      try {
        await this.executeAssessment({
          simulate: false,
          network,
          format: format as any,
          detailed: true,
          verbose: true
        });
      } catch (error) {
        console.error('❌ Assessment failed:', error);
      }
    }

    await this.askToContinue();
  }

  private async runInteractiveAssessment(): Promise<void> {
    console.log('\n🎮 Interactive Assessment Mode\n');
    
    // Collect preferences
    const preferences = await this.collectPreferences();
    
    try {
      await this.executeAssessment({
        ...preferences,
        interactive: true,
        detailed: true
      });
    } catch (error) {
      console.error('❌ Assessment failed:', error);
    }

    await this.askToContinue();
  }

  private async generateReport(): Promise<void> {
    console.log('\n📊 Report Generation\n');
    
    const format = await this.askQuestion('Report format (json/markdown/html): ') || 'markdown';
    const outputFile = await this.askQuestion('Output file name (optional): ');
    const network = await this.askQuestion('Network (hardhat/localhost/mainnet): ') || 'hardhat';
    
    try {
      const options: any = {
        simulate: true,
        network,
        format,
        detailed: true,
        verbose: true
      };

      if (outputFile) {
        options.output = outputFile;
      }

      await this.executeAssessment(options);
      
      if (outputFile) {
        console.log(`✅ Report saved to: ${outputFile}`);
      }
    } catch (error) {
      console.error('❌ Report generation failed:', error);
    }

    await this.askToContinue();
  }

  private async startMonitoring(): Promise<void> {
    console.log('\n📈 Continuous Monitoring Mode\n');
    
    const interval = await this.askQuestion('Check interval in minutes (default: 60): ') || '60';
    const network = await this.askQuestion('Network to monitor: ') || 'hardhat';
    
    console.log(`🔄 Starting continuous monitoring every ${interval} minutes...`);
    console.log('Press Ctrl+C to stop\n');
    
    const intervalMs = parseInt(interval) * 60 * 1000;
    
    const monitor = setInterval(async () => {
      console.log(`\n⏰ ${new Date().toISOString()} - Running assessment...`);
      
      try {
        await this.executeAssessment({
          simulate: true,
          network,
          format: 'console',
          detailed: false
        });
      } catch (error) {
        console.error('❌ Monitoring check failed:', error);
      }
    }, intervalMs);

    // Initial check
    await this.executeAssessment({
      simulate: true,
      network,
      format: 'console',
      detailed: true
    });

    // Wait for Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(monitor);
      console.log('\n\n🛑 Monitoring stopped.');
      this.rl.close();
    });
  }

  private async showHelp(): Promise<void> {
    console.log('\n❓ Help & Documentation\n');
    console.log('🔒 Enhanced Freeze Readiness Assessment Tool');
    console.log('==========================================\n');
    console.log('This tool helps assess whether the PayRox system is ready');
    console.log('for permanent freeze (immutable deployment).\n');
    
    console.log('📋 Assessment Categories:');
    console.log('  • Security: Audits, penetration testing, code freeze');
    console.log('  • Governance: Procedures, multi-sig, access control');
    console.log('  • Testing: Coverage, environment validation, simulation');
    console.log('  • Documentation: Guides, procedures, API docs');
    console.log('  • Operations: Monitoring, backup, performance\n');
    
    console.log('🎯 Assessment Modes:');
    console.log('  • Simulation: Uses mock data for testing');
    console.log('  • Live: Checks actual deployment status');
    console.log('  • Interactive: Guided assessment with prompts\n');
    
    console.log('📊 Output Formats:');
    console.log('  • Console: Human-readable terminal output');
    console.log('  • JSON: Machine-readable structured data');
    console.log('  • Markdown: Documentation-friendly format');
    console.log('  • HTML: Web-viewable formatted report\n');
    
    console.log('⚠️  IMPORTANT: Freeze operation is IRREVERSIBLE!');
    console.log('Only proceed when ALL critical conditions are met.\n');

    await this.askToContinue();
  }

  private async collectPreferences(): Promise<any> {
    const preferences: any = {};
    
    preferences.network = await this.askQuestion('Network: ') || 'hardhat';
    preferences.format = await this.askQuestion('Output format (console/json/markdown/html): ') || 'console';
    
    const useSimulation = await this.askQuestion('Use simulation mode? (Y/n): ');
    preferences.simulate = useSimulation.toLowerCase() !== 'n';
    
    const verbose = await this.askQuestion('Enable verbose output? (Y/n): ');
    preferences.verbose = verbose.toLowerCase() !== 'n';
    
    return preferences;
  }

  private async executeAssessment(options: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = [];
      
      if (options.simulate) args.push('--simulate');
      if (options.detailed) args.push('--detailed');
      if (options.verbose) args.push('--verbose');
      if (options.interactive) args.push('--interactive');
      if (options.format && options.format !== 'console') args.push(`--format ${options.format}`);
      if (options.output) args.push(`--output ${options.output}`);
      if (options.network && options.network !== 'hardhat') args.push(`--network ${options.network}`);
      
      const command = `npx hardhat run test/validation/Enhanced_Freeze_Readiness_Tool.ts${args.length ? ' -- ' + args.join(' ') : ''}`;
      
      console.log(`🚀 Executing: ${command}\n`);
      
      const child = exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          console.log(stdout);
          if (stderr) console.error(stderr);
          resolve();
        }
      });
    });
  }

  private askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  private async askToContinue(): Promise<void> {
    await this.askQuestion('\nPress Enter to continue...');
    console.log('');
    await this.showMainMenu();
  }
}

// Main execution
async function main() {
  const cli = new FreezeReadinessCLI();
  await cli.start();
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { FreezeReadinessCLI };
