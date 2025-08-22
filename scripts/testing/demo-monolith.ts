#!/usr/bin/env ts-node
/**
 * Monolith Generation Demo Script
 *
 * Demonstrates how to use the monolith generator for testing PayRox splitter and gates.
 * This script generates various sized contracts and shows their characteristics.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface ContractInfo {
  name: string;
  path: string;
  targetKb: number;
  functions: number;
  actualSize?: number;
  bytecodeSize?: number;
  deployed?: boolean;
}

const testContracts: ContractInfo[] = [
  {
    name: "PayRoxSmallTest",
    path: "contracts/test/PayRoxSmallTest.sol",
    targetKb: 15,
    functions: 50
  },
  {
    name: "PayRoxMediumTest",
    path: "contracts/test/PayRoxMediumTest.sol",
    targetKb: 35,
    functions: 150
  },
  {
    name: "PayRoxLargeTest",
    path: "contracts/test/PayRoxLargeTest.sol",
    targetKb: 70,
    functions: 400
  },
  {
    name: "PayRoxMegaTest",
    path: "contracts/test/PayRoxMegaTest.sol",
    targetKb: 120,
    functions: 1000
  }
];

function log(message: string) {
  console.log(`🔧 ${message}`);
}

function success(message: string) {
  console.log(`✅ ${message}`);
}

function warning(message: string) {
  console.log(`⚠️  ${message}`);
}

function info(message: string) {
  console.log(`📊 ${message}`);
}

function generateContract(contract: ContractInfo): void {
  log(`Generating ${contract.name}...`);

  const command = `npx ts-node scripts/testing/gen-monolith.ts --out "${contract.path}" --name "${contract.name}" --functions ${contract.functions} --target-kb ${contract.targetKb}`;

  try {
    const output = execSync(command, { encoding: 'utf-8' });
    console.log(output);

    // Get actual file size
    if (fs.existsSync(contract.path)) {
      const stats = fs.statSync(contract.path);
      contract.actualSize = stats.size;
      success(`Generated ${contract.name} - ${(stats.size / 1024).toFixed(1)}KB`);
    }
  } catch (error) {
    console.error(`❌ Failed to generate ${contract.name}:`, error);
  }
}

function compileContracts(): void {
  log("Compiling all contracts...");

  try {
    const output = execSync("npx hardhat compile", { encoding: 'utf-8' });
    console.log(output);
    success("All contracts compiled successfully");
  } catch (error) {
    console.error("❌ Compilation failed:", error);
  }
}

function analyzeArtifacts(): void {
  log("Analyzing contract artifacts...");

  for (const contract of testContracts) {
    const artifactPath = `artifacts/${contract.path}/${contract.name}.json`;

    if (fs.existsSync(artifactPath)) {
      try {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
        const bytecodeSize = (artifact.bytecode.length - 2) / 2; // Remove 0x and convert hex to bytes
        contract.bytecodeSize = bytecodeSize;

        info(`${contract.name}:`);
        info(`  Source size: ${contract.actualSize ? (contract.actualSize / 1024).toFixed(1) : 'Unknown'}KB`);
        info(`  Bytecode size: ${(bytecodeSize / 1024).toFixed(1)}KB`);
        info(`  Functions: ${contract.functions}`);
        info(`  EIP-170 compliant: ${bytecodeSize <= 24576 ? 'Yes' : 'No'}`);
        info(`  Deployable: ${bytecodeSize <= 24576 ? 'Yes' : 'No (too large for mainnet)'}`);
        console.log("");
      } catch (error) {
        warning(`Could not analyze ${contract.name}: ${error}`);
      }
    } else {
      warning(`Artifact not found for ${contract.name}`);
    }
  }
}

function demonstrateUsage(): void {
  console.log(`
=== MONOLITH GENERATOR USAGE EXAMPLES ===

1. Generate a basic test contract:
   npx ts-node scripts/testing/gen-monolith.ts \\
     --out contracts/test/MyTest.sol \\
     --name MyTestContract \\
     --functions 100 \\
     --target-kb 20

2. Generate a large contract for splitter testing:
   npx ts-node scripts/testing/gen-monolith.ts \\
     --out contracts/test/SplitterTest.sol \\
     --name SplitterTestContract \\
     --functions 800 \\
     --target-kb 85

3. Generate with specific Solidity version:
   npx ts-node scripts/testing/gen-monolith.ts \\
     --out contracts/test/VersionTest.sol \\
     --name VersionTestContract \\
     --pragma 0.8.19 \\
     --functions 200 \\
     --target-kb 30

=== TESTING RECOMMENDATIONS ===

For splitter and gate testing:
- Small contracts (15-25KB): Basic functionality testing
- Medium contracts (35-50KB): Intermediate processing testing
- Large contracts (70-85KB): Stress testing source size limits
- Mega contracts (100KB+): EIP-170 violation testing (compile only)

For selector parity testing:
- Use contracts with 200+ functions for comprehensive coverage
- Mix of pure, view, payable, and state-changing functions
- Diverse parameter types and return values

For deployment testing:
- Keep deployable contracts under 24KB bytecode
- Use larger contracts for source analysis only
- Test with different optimizer settings

=== IMPORTANT NOTES ===

- All generated contracts are in contracts/test/ directory
- They are clearly marked as TEST CONTRACTS - NOT FOR PRODUCTION
- Large contracts will show EIP-170 warnings (expected for testing)
- Use --help flag for full command options

`);
}

function main(): void {
  console.log("🚀 PayRox Monolith Generation Demo\n");

  // Ensure test directory exists
  const testDir = "contracts/test";
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
    log(`Created test directory: ${testDir}`);
  }

  // Generate all test contracts
  for (const contract of testContracts) {
    generateContract(contract);
  }

  console.log("");

  // Compile contracts
  compileContracts();

  console.log("");

  // Analyze results
  analyzeArtifacts();

  // Show usage examples
  demonstrateUsage();

  success("Monolith generation demo completed!");
  info("Ready for splitter and gate testing!");
}

if (require.main === module) {
  main();
}
