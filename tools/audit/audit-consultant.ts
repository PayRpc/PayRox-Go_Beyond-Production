#!/usr/bin/env ts-node

/**
 * PayRox Audit Consultation Interface
 * Automates communication with external auditors and structures audit preparation
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface AuditScope {
  contracts: string[];
  criticalFunctions: string[];
  riskAreas: string[];
  testCoverage: string[];
}

interface AuditContext {
  projectName: string;
  repoUrl: string;
  branch: string;
  scope: AuditScope;
  timeline: string;
  budget?: string;
  deliverables: string[];
}

interface AuditFinding {
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  title: string;
  description: string;
  location: string;
  recommendation: string;
  references?: string[];
}

class AuditConsultant {
  private context: AuditContext;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.context = this.generatePayRoxContext();
  }

  private generatePayRoxContext(): AuditContext {
    return {
      projectName: 'PayRox-Go_Beyond-Production',
      repoUrl: 'https://github.com/PayRpc/PayRox-Go_Beyond-Production',
      branch: 'main',
      scope: {
        contracts: [
          'contracts/dispacher/ManifestDispacher.sol',
          'contracts/orchestrator/*.sol',
          'contracts/facets/*.sol',
          'contracts/governance/*.sol',
          'contracts/security/*.sol',
        ],
        criticalFunctions: [
          'manifest dispatch and routing',
          'facet splitting and size validation',
          'diamond pattern implementation',
          'governance access controls',
          'security pause mechanisms',
        ],
        riskAreas: [
          'Diamond proxy upgrades',
          'Facet selector collisions',
          'Gas limit compliance (EIP-170)',
          'Access control bypass',
          'Reentrancy in dispatcher',
          'State corruption during upgrades',
        ],
        testCoverage: ['tests/diamond-compliance/', 'tests/tools/splitter/', 'scripts/security/'],
      },
      timeline: '2-3 weeks',
      deliverables: [
        'Comprehensive security audit report',
        'Gas optimization recommendations',
        'Code quality improvements',
        'Test coverage enhancement suggestions',
        'Deployment security checklist',
      ],
    };
  }

  async generateAuditPrep(): Promise<string> {
    const prep = {
      timestamp: new Date().toISOString(),
      context: this.context,
      codeMetrics: await this.getCodeMetrics(),
      contractSizes: await this.getContractSizes(),
      testResults: await this.getTestResults(),
      securityChecks: await this.runSecurityChecks(),
      documentation: this.getDocumentationLinks(),
    };

    const prepPath = path.join(this.workspaceRoot, 'audit-prep.json');
    fs.writeFileSync(prepPath, JSON.stringify(prep, null, 2));

    return prepPath;
  }

  private async getCodeMetrics(): Promise<any> {
    try {
      const contracts = this.findSolidityFiles();
      return {
        totalContracts: contracts.length,
        totalLines: this.countTotalLines(contracts),
        complexity: 'Medium-High (Diamond pattern with facets)',
        dependencies: this.getKeyDependencies(),
      };
    } catch (error) {
      return { error: 'Could not analyze code metrics' };
    }
  }

  private async getContractSizes(): Promise<any> {
    try {
      const artifactsPath = path.join(this.workspaceRoot, 'artifacts');
      if (!fs.existsSync(artifactsPath)) {
        return { warning: 'Run npm run compile first to get contract sizes' };
      }

      // Check for contract size violations
      const _sizes: Record<string, number> = {};
      // Implementation would scan compiled contracts
      return {
        note: 'Contract sizes available after compilation',
        eip170Limit: '24,576 bytes',
        recommendation: 'Use facet splitting for oversized contracts',
      };
    } catch (error) {
      return { error: 'Could not analyze contract sizes' };
    }
  }

  private async getTestResults(): Promise<any> {
    try {
      const _result = execSync('npm test 2>&1', {
        cwd: this.workspaceRoot,
        encoding: 'utf8',
        timeout: 30000,
      });
      return {
        status: 'Tests executed',
        recommendation: 'Review test output for coverage gaps',
      };
    } catch (error) {
      return {
        status: 'Tests need attention',
        recommendation: 'Fix failing tests before audit',
      };
    }
  }

  private async runSecurityChecks(): Promise<any> {
    const checks = {
      solhint: this.runSolhint(),
      eslint: this.runESLint(),
      dependencyAudit: this.runDependencyAudit(),
    };

    return checks;
  }

  private runSolhint(): any {
    try {
      execSync('npx solhint contracts/**/*.sol', {
        cwd: this.workspaceRoot,
        stdio: 'pipe',
      });
      return { status: 'PASS', message: 'No Solidity linting issues' };
    } catch (error) {
      return { status: 'ISSUES', message: 'Solidity linting found issues' };
    }
  }

  private runESLint(): any {
    try {
      execSync('npx eslint scripts tools --quiet', {
        cwd: this.workspaceRoot,
        stdio: 'pipe',
      });
      return { status: 'PASS', message: 'No TypeScript linting issues' };
    } catch (error) {
      return { status: 'ISSUES', message: 'TypeScript linting found issues' };
    }
  }

  private runDependencyAudit(): any {
    try {
      const _result = execSync('npm audit --audit-level=moderate', {
        cwd: this.workspaceRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { status: 'CLEAN', message: 'No security vulnerabilities' };
    } catch (error) {
      return { status: 'VULNERABILITIES', message: 'Dependencies have security issues' };
    }
  }

  private findSolidityFiles(): string[] {
    const contractsDir = path.join(this.workspaceRoot, 'contracts');
    if (!fs.existsSync(contractsDir)) return [];

    const files: string[] = [];
    const scan = (dir: string) => {
      fs.readdirSync(dir).forEach((item) => {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
          scan(fullPath);
        } else if (item.endsWith('.sol')) {
          files.push(fullPath);
        }
      });
    };
    scan(contractsDir);
    return files;
  }

  private countTotalLines(files: string[]): number {
    return files.reduce((total, file) => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        return total + content.split('\n').length;
      } catch {
        return total;
      }
    }, 0);
  }

  private getKeyDependencies(): string[] {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(this.workspaceRoot, 'package.json'), 'utf8'),
      );
      return [
        '@openzeppelin/contracts',
        'hardhat',
        'ethers',
        ...Object.keys(packageJson.dependencies || {}).slice(0, 5),
      ];
    } catch {
      return ['Unable to read dependencies'];
    }
  }

  private getDocumentationLinks(): string[] {
    const docs = [];
    const readmePath = path.join(this.workspaceRoot, 'README.md');
    if (fs.existsSync(readmePath)) docs.push('README.md');

    const docsDir = path.join(this.workspaceRoot, 'docs');
    if (fs.existsSync(docsDir)) docs.push('docs/ directory');

    // Look for specific documentation files
    const docFiles = [
      'GOVERNANCE_SECURITY_AUDIT.md',
      'MANIFEST_DISPATCHER_SECURITY_AUDIT.md',
      'ORDERED_MERKLE_SECURITY_AUDIT.md',
      'SYNTH_STORAGE_COMPREHENSIVE_DOCS.md',
    ];

    docFiles.forEach((file) => {
      if (fs.existsSync(path.join(this.workspaceRoot, file))) {
        docs.push(file);
      }
    });

    return docs;
  }

  generateCommunicationTemplate(auditorType: 'external' | 'chatgpt' = 'external'): string {
    if (auditorType === 'chatgpt') {
      return this.generateChatGPTPrompt();
    }

    return `
Subject: Smart Contract Security Audit Request - PayRox Diamond Proxy System

Hello,

I'm seeking a comprehensive security audit for PayRox, a diamond proxy-based DeFi protocol with advanced facet management.

## Project Overview
- **Name**: ${this.context.projectName}
- **Repository**: ${this.context.repoUrl}
- **Branch**: ${this.context.branch}
- **Architecture**: Diamond pattern (EIP-2535) with custom dispatcher

## Audit Scope
### Critical Contracts:
${this.context.scope.contracts.map((c) => `- ${c}`).join('\n')}

### Key Risk Areas:
${this.context.scope.riskAreas.map((r) => `- ${r}`).join('\n')}

### Critical Functions:
${this.context.scope.criticalFunctions.map((f) => `- ${f}`).join('\n')}

## Deliverables Requested:
${this.context.deliverables.map((d) => `- ${d}`).join('\n')}

## Timeline & Budget:
- **Preferred Timeline**: ${this.context.timeline}
- **Budget**: Please provide your rate structure

## Access:
I can provide read-only repository access or specific file extracts as needed.

## Additional Context:
- The system includes automated facet splitting for EIP-170 compliance
- Custom manifest-based routing with selector collision detection
- Governance-controlled upgrade mechanisms with security pauses

Please let me know:
1. Your availability and timeline
2. Audit methodology and tools used  
3. Pricing structure (hourly rate or fixed fee)
4. Required access level and preferred communication method

Thank you for your time and expertise.

Best regards,
[Your Name]
    `.trim();
  }

  private generateChatGPTPrompt(): string {
    return `
I need a comprehensive security review of my Solidity smart contract system. Here's the context:

## Project: PayRox Diamond Proxy System

**Architecture**: Diamond pattern (EIP-2535) with custom facet management
**Key Innovation**: Automated contract splitting for gas limit compliance

## Files to Review:
${this.context.scope.contracts.map((c) => `- ${c}`).join('\n')}

## Critical Security Areas:
${this.context.scope.riskAreas.map((r) => `- ${r}`).join('\n')}

## Specific Questions:
1. **Diamond Security**: Are there vulnerabilities in our diamond proxy implementation?
2. **Facet Routing**: Could the manifest dispatcher be exploited for unauthorized access?
3. **Gas Optimization**: Are there efficiency improvements for facet splitting?
4. **Upgrade Safety**: What risks exist in our governance-controlled upgrades?
5. **Selector Collisions**: How robust is our collision detection system?

## What I Need:
- Security vulnerability analysis with severity ratings
- Gas optimization recommendations  
- Best practice compliance review
- Specific code improvements with examples
- Testing strategy recommendations

## Code Style:
- Solidity ^0.8.30
- OpenZeppelin contracts v5.4.0
- Hardhat development environment
- TypeScript tooling and automation

Please provide a structured audit with:
1. Executive summary of findings
2. Detailed vulnerability analysis
3. Recommended fixes with code examples
4. Gas optimization opportunities
5. Additional security measures to implement

I can share specific contract code or provide more context as needed.
    `.trim();
  }

  async startInteractiveSession(): Promise<void> {
    console.log('\n🔍 PayRox Audit Consultant - Interactive Mode\n');

    // Generate audit preparation
    console.log('📋 Generating audit preparation...');
    const prepPath = await this.generateAuditPrep();
    console.log(`✅ Audit prep saved to: ${prepPath}`);

    // Show available options
    console.log('\n📝 Available Communication Templates:');
    console.log('1. External auditor email template');
    console.log('2. ChatGPT audit prompt');
    console.log('3. Generate audit checklist');
    console.log('4. Run pre-audit security checks');

    console.log('\n💡 Quick Commands:');
    console.log('- Run: npm run audit:prep');
    console.log('- Get external template: npm run audit:template');
    console.log('- Get ChatGPT prompt: npm run audit:chatgpt');
  }

  async generateAuditChecklist(): Promise<string> {
    const checklist = `
# PayRox Security Audit Checklist

## Pre-Audit Preparation
- [ ] All tests passing
- [ ] Contracts compiled successfully  
- [ ] No critical linting issues
- [ ] Documentation updated
- [ ] Dependency vulnerabilities resolved

## Contract Security Review
- [ ] Access control mechanisms
- [ ] Reentrancy protection
- [ ] Integer overflow/underflow
- [ ] Gas griefing vectors
- [ ] Front-running vulnerabilities

## Diamond Pattern Specific
- [ ] Facet selector uniqueness
- [ ] Diamond storage collision prevention
- [ ] Upgrade mechanism security
- [ ] Facet initialization safety
- [ ] Loupe compliance (EIP-2535)

## PayRox Specific Areas
- [ ] Manifest dispatcher routing security
- [ ] Facet splitting algorithm correctness
- [ ] EIP-170 size compliance validation
- [ ] Governance access controls
- [ ] Emergency pause mechanisms

## Gas & Performance
- [ ] Contract size optimization
- [ ] Function gas cost analysis
- [ ] Storage layout efficiency
- [ ] Batch operation safety

## Testing & Coverage
- [ ] Unit test coverage >90%
- [ ] Integration test scenarios
- [ ] Edge case handling
- [ ] Failure mode testing
- [ ] Upgrade scenario testing

## Documentation Review
- [ ] Technical specifications complete
- [ ] Security assumptions documented
- [ ] Known limitations disclosed
- [ ] Deployment procedures verified
- [ ] Emergency procedures defined
    `.trim();

    const checklistPath = path.join(this.workspaceRoot, 'audit-checklist.md');
    fs.writeFileSync(checklistPath, checklist);

    return checklistPath;
  }
}

// CLI Interface
if (require.main === module) {
  const consultant = new AuditConsultant(process.cwd());

  const command = process.argv[2];

  switch (command) {
    case 'prep':
      consultant.generateAuditPrep().then((path) => {
        console.log(`Audit preparation generated: ${path}`);
      });
      break;

    case 'template':
      console.log(consultant.generateCommunicationTemplate('external'));
      break;

    case 'chatgpt':
      console.log(consultant.generateCommunicationTemplate('chatgpt'));
      break;

    case 'checklist':
      consultant.generateAuditChecklist().then((path) => {
        console.log(`Audit checklist generated: ${path}`);
      });
      break;

    case 'interactive':
    default:
      consultant.startInteractiveSession();
      break;
  }
}

export { AuditConsultant, type AuditContext, type AuditFinding };
