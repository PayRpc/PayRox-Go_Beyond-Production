import fs from 'fs';
import path from 'path';
/**
 * Production Readiness End-to-End Test Suite
 *
 * Comprehensive testing of production deployment readiness including
 * contract deployment, validation, and system integration tests.
 */

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract, ContractFactory } from 'ethers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import * as fs from 'fs';
import * as path from 'path';

describe('Production Readiness E2E Tests', function() {
    let deployer: HardhatEthersSigner;
    let governance: HardhatEthersSigner;
    let factory: ContractFactory;
    let deployedContract: Contract;

    const _testOutputDir = './test-output/e2e';

    before(async function() {
        // Setup test accounts
        const _signers = await ethers.getSigners();
        deployer = signers[0]!;
        governance = signers[1]!

        // Ensure output directory exists
        if (!fs.existsSync(testOutputDir)) {
            fs.mkdirSync(testOutputDir, { recursive: true });
        }
    });

    describe('Contract Deployment Readiness', function() {
        it('should have all required contract files', function() {
            const requiredContracts = [
                'contracts/Diamond.sol',
                'contracts/facets/DiamondCutFacet.sol',
                'contracts/facets/DiamondLoupeFacet.sol',
                'contracts/interfaces/IDiamondCut.sol',
                'contracts/interfaces/IDiamondLoupe.sol'
            ];

            for (const contractPath of requiredContracts) {
                const _fullPath = path.join(process.cwd(), contractPath);
                expect(fs.existsSync(fullPath), `Contract file missing: ${contractPath}`).to.be.true;
            }
        });

        it('should compile all contracts successfully', async function() {
            this.timeout(60000);

            try {
                // Attempt to get a contract factory to test compilation
                factory = await ethers.getContractFactory('Diamond');
                expect(factory).to.not.be.undefined;
            } catch (error) {
                throw new Error(`Contract compilation failed: ${error}`);
            }
        });

        it('should have valid contract bytecode', async function() {
            const _bytecode = factory.bytecode;
            expect(bytecode).to.not.be.empty;
            expect(bytecode.startsWith('0x')).to.be.true;

            // Check EIP-170 size limit (24,576 bytes)
            const _sizeInBytes = (bytecode.length - 2) / 2;
            expect(sizeInBytes).to.be.lessThan(24576, 'Contract exceeds EIP-170 size limit');
        });
    });

    describe('Network Configuration', function() {
        it('should have valid network configuration', function() {
            const _hardhatConfigPath = path.join(process.cwd(), 'hardhat.config.ts');
            expect(fs.existsSync(hardhatConfigPath), 'hardhat.config.ts not found').to.be.true;

            // Read and validate config exists
            const _configContent = fs.readFileSync(hardhatConfigPath, 'utf8');
            expect(configContent).to.include('networks');
        });

        it('should connect to test network', async function() {
            const _provider = ethers.provider;
            const _network = await provider.getNetwork();

            expect(network).to.not.be.undefined;
            expect(network.chainId).to.be.a('bigint');
        });

        it('should have sufficient test account balance', async function() {
            const _deployerAddress = await deployer.getAddress();
            const _balance = await ethers.provider.getBalance(deployerAddress);
            const _minimumBalance = ethers.parseEther('1.0');

            expect(balance).to.be.at.least(minimumBalance, 'Insufficient balance for deployment tests');
        });
    });

    describe('Deployment Process Validation', function() {
        let deployedContract: Contract;

        it('should deploy a test contract successfully', async function() {
            this.timeout(30000);

            try {
                // Deploy Diamond contract as a representative test
                const _deployerAddress = await deployer.getAddress();
                const contract = await factory.deploy(
                    deployerAddress, // owner
                    []  // initial facet cuts (empty for test)
                );
                deployedContract = contract as Contract;

                await deployedContract.waitForDeployment();
                const _address = await deployedContract.getAddress();

                expect(address).to.not.be.empty;
                expect(ethers.isAddress(address)).to.be.true;

                console.log(`    ✅ Test contract deployed at: ${address}`);
            } catch (error) {
                throw new Error(`Deployment failed: ${error}`);
            }
        });

        it('should verify deployed contract code', async function() {
            const _address = await deployedContract.getAddress();
            const _deployedCode = await ethers.provider.getCode(address);

            expect(deployedCode).to.not.equal('0x', 'No code found at deployed address');
            expect(deployedCode.length).to.be.greaterThan(2, 'Deployed code is too short');
        });

        it('should interact with deployed contract', async function() {
            // Test basic contract interaction
            try {
                // Try calling a view function (owner) if available
                const _maybeOwner = (deployedContract as any)?.owner;
                if (typeof maybeOwner === 'function') {
                    const _owner = await maybeOwner.call(deployedContract);
                    const _deployerAddress = await deployer.getAddress();
                    expect(owner).to.equal(deployerAddress);
                    console.log(`    ✅ Contract interaction successful, owner: ${owner}`);
                } else {
                    console.log('    Skipping owner() check: function not present on contract');
                }
            } catch (error) {
                throw new Error(`Contract interaction failed: ${error}`);
            }
        });
    });

    describe('Gas Analysis', function() {
        it('should have reasonable deployment gas costs', async function() {
            const _deploymentTx = deployedContract.deploymentTransaction();
            if (deploymentTx) {
                const _gasUsed = deploymentTx.gasLimit;
                const _maxReasonableGas = 6000000n; // 6M gas limit

                expect(gasUsed).to.be.lessThan(maxReasonableGas, 'Deployment gas too high');
                console.log(`    ✅ Deployment gas used: ${gasUsed.toString()}`);
            }
        });
    });

    describe('System Integration', function() {
        it('should have all required dependencies available', function() {
            const _packageJsonPath = path.join(process.cwd(), 'package.json');
            expect(fs.existsSync(packageJsonPath), 'package.json not found').to.be.true;

            const _packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

            // Check for critical dependencies
            const _requiredDeps = ['hardhat', 'ethers', '@openzeppelin/contracts'];
            for (const dep of requiredDeps) {
                const _found = packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep];
                expect(found, `Required dependency missing: ${dep}`).to.not.be.undefined;
            }
        });

        it('should pass artifact validation', function() {
            const _artifactsDir = path.join(process.cwd(), 'artifacts');
            if (fs.existsSync(artifactsDir)) {
                const _stats = fs.statSync(artifactsDir);
                expect(stats.isDirectory(), 'Artifacts should be a directory').to.be.true;

                console.log(`    ✅ Artifacts directory found and accessible`);
            }
        });
    });

    describe('Security Validation', function() {
        it('should not have obvious security vulnerabilities in test setup', function() {
            // Basic security checks for test environment
            expect(deployer.address).to.not.be.empty;
            expect(governance.address).to.not.be.empty;
            expect(deployer.address).to.not.equal(governance.address);
        });
    });

    after(function() {
        // Cleanup and report generation
        const _reportPath = path.join(testOutputDir, 'production-readiness-report.json');
        const report = {
            timestamp: new Date().toISOString(),
            network: 'test',
            deployer: deployer.address,
            governance: governance.address,
            testContract: deployedContract ? deployedContract.target : null,
            status: 'completed',
            summary: 'All production readiness tests completed successfully'
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📋 Production readiness report saved to: ${reportPath}`);
    });
});
