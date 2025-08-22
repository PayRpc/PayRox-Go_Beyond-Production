import fs from 'fs';
import path from 'path';
/**
 * Split All Contracts Tool
 *
 * Splits large smart contracts into smaller Diamond Pattern facets
 * for better maintainability and gas optimization.
 */

import * as fs from 'fs';
import * as path from 'path';

interface SplitConfig {
    maxContractSize: number;
    outputDirectory: string;
    preserveStorage: boolean;
    generateInterfaces: boolean;
}

interface ContractInfo {
    name: string;
    path: string;
    size: number;
    functions: string[];
    storage: string[];
}

class ContractSplitter {
    private config: SplitConfig;

    constructor(config: SplitConfig) {
        this.config = config;
    }

    /**
     * Split all contracts in a directory
     */
    async splitAll(directory: string): Promise<void> {
        console.log(`🔧 Starting contract splitting in: ${directory}`);

        const _contracts = this.findContracts(directory);
        console.log(`📁 Found ${contracts.length} contracts to analyze`);

        for (const contract of contracts) {
            await this.analyzeAndSplit(contract);
        }

        console.log(`✅ Contract splitting completed`);
    }

    /**
     * Find all Solidity contracts in directory
     */
    private findContracts(directory: string): string[] {
        const contracts: string[] = [];

        const _files = fs.readdirSync(directory);
        for (const file of files) {
            const _fullPath = path.join(directory, file);
            const _stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                contracts.push(...this.findContracts(fullPath));
            } else if (file.endsWith('.sol')) {
                contracts.push(fullPath);
            }
        }

        return contracts;
    }

    /**
     * Analyze contract and split if necessary
     */
    private async analyzeAndSplit(contractPath: string): Promise<void> {
        const _content = fs.readFileSync(contractPath, 'utf8');
        const _contractInfo = this.analyzeContract(contractPath, content);

        console.log(`📊 Analyzing: ${contractInfo.name}`);
        console.log(`   Size: ${contractInfo.size} bytes`);
        console.log(`   Functions: ${contractInfo.functions.length}`);

        if (contractInfo.size > this.config.maxContractSize) {
            console.log(`⚠️  Contract exceeds size limit, splitting...`);
            await this.splitContract(contractInfo, content);
        } else {
            console.log(`✅ Contract size is acceptable`);
        }
    }

    /**
     * Analyze contract structure
     */
    private analyzeContract(contractPath: string, content: string): ContractInfo {
        const _name = path.basename(contractPath, '.sol');
        const _size = Buffer.byteLength(content, 'utf8');

        // Simple function extraction (could be enhanced with proper Solidity parsing)
        const _functionMatches = content.match(/function\s+(\w+)/g) || [];
        const _functions = functionMatches.map(match => match.replace('function ', ''));

        // Simple storage variable extraction
        const _storageMatches = content.match(/^\s*\w+.*?;/gm) || [];
        const storage = storageMatches.filter(line =>
            !line.includes('function') &&
            !line.includes('event') &&
            !line.includes('modifier')
        );

        return {
            name,
            path: contractPath,
            size,
            functions,
            storage
        };
    }

    /**
     * Split contract into multiple facets
     */
    private async splitContract(contractInfo: ContractInfo, content: string): Promise<void> {
        const _outputDir = path.join(this.config.outputDirectory, contractInfo.name);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Simple splitting strategy: divide functions into groups
        const _functionsPerPart = Math.ceil(contractInfo.functions.length / 2);
        const _parts = [];

        for (let _i = 0; i < contractInfo.functions.length; i += functionsPerPart) {
            parts.push(contractInfo.functions.slice(i, i + functionsPerPart));
        }

        for (let _i = 0; i < parts.length; i++) {
            const _partName = `${contractInfo.name}_Part${i + 1}`;
            const _partContent = this.generatePartContract(partName, parts[i], contractInfo);

            const _outputPath = path.join(outputDir, `${partName}.sol`);
            fs.writeFileSync(outputPath, partContent);

            console.log(`📝 Generated: ${partName}.sol`);
        }

        if (this.config.generateInterfaces) {
            await this.generateInterfaces(contractInfo, parts, outputDir);
        }

        if (this.config.preserveStorage) {
            await this.generateStorageLibrary(contractInfo, outputDir);
        }
    }

    /**
     * Generate split contract part
     */
    private generatePartContract(partName: string, functions: string[], contractInfo: ContractInfo): string {
        return `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title ${partName}
 * @notice Split part of ${contractInfo.name}
 * @dev Generated by PayRox Contract Splitter
 */
contract ${partName} {
    // Storage (preserved from original)
    ${contractInfo.storage.slice(0, 3).join('\n    ')}

    // Functions for this part
    ${functions.map(func => `// TODO: Implement ${func}()`).join('\n    ')}

    /**
     * @notice Placeholder function implementations
     * @dev These need to be manually implemented from the original contract
     */
    function getFacetInfo()
        external
        pure
        returns (string memory name, string memory version, bytes4[] memory selectors)
    {
        name = "${partName}";
        version = "1.0.0";
        selectors = new bytes4[](${functions.length});
        // TODO: Add actual selectors
    }
}`;
    }

    /**
     * Generate interfaces for split parts
     */
    private async generateInterfaces(contractInfo: ContractInfo, parts: string[][], outputDir: string): Promise<void> {
        const _interfacesDir = path.join(outputDir, 'interfaces');
        if (!fs.existsSync(interfacesDir)) {
            fs.mkdirSync(interfacesDir);
        }

        for (let _i = 0; i < parts.length; i++) {
            const _partName = `${contractInfo.name}_Part${i + 1}`;
            const _interfaceName = `I${partName}`;

            const interfaceContent = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ${interfaceName} {
    ${parts[i].map(func => `// function ${func}(); // TODO: Add proper signature`).join('\n    ')}
}`;

            const _interfacePath = path.join(interfacesDir, `${interfaceName}.sol`);
            fs.writeFileSync(interfacePath, interfaceContent);
        }
    }

    /**
     * Generate storage library
     */
    private async generateStorageLibrary(contractInfo: ContractInfo, outputDir: string): Promise<void> {
        const _librariesDir = path.join(outputDir, 'libraries');
        if (!fs.existsSync(librariesDir)) {
            fs.mkdirSync(librariesDir);
        }

        const storageContent = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library ${contractInfo.name}Storage {
    bytes32 internal constant STORAGE_SLOT = keccak256("payrox.${contractInfo.name.toLowerCase()}.storage");

    struct Layout {
        // Preserved storage variables
        ${contractInfo.storage.slice(0, 5).join('\n        ')}
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}`;

        const _storagePath = path.join(librariesDir, `${contractInfo.name}Storage.sol`);
        fs.writeFileSync(storageePath, storageContent);
    }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
    const _args = process.argv.slice(2);

    const config: SplitConfig = {
        maxContractSize: 20000,
        outputDirectory: './split-contracts',
        preserveStorage: true,
        generateInterfaces: true
    };

    let _targetDirectory = './contracts';

    // Parse command line arguments
    for (let _i = 0; i < args.length; i++) {
        if (args[i] === '--directory' && i + 1 < args.length) {
            targetDirectory = args[i + 1];
            i++;
        } else if (args[i] === '--output' && i + 1 < args.length) {
            config.outputDirectory = args[i + 1];
            i++;
        } else if (args[i] === '--max-size' && i + 1 < args.length) {
            config.maxContractSize = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === '--help') {
            console.log('Usage: node split-all.ts [options]');
            console.log('Options:');
            console.log('  --directory <dir>   Directory to scan for contracts');
            console.log('  --output <dir>      Output directory for split contracts');
            console.log('  --max-size <bytes>  Maximum contract size before splitting');
            console.log('  --help              Show this help');
            return;
        }
    }

    try {
        const _splitter = new ContractSplitter(config);
        await splitter.splitAll(targetDirectory);
    } catch (error) {
        console.error('❌ Error during contract splitting:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { ContractSplitter, SplitConfig };
