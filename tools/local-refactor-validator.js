#!/usr/bin/env node
/**
 * @fileoverview Local refactor validator for PayRox contracts
 * @description Validates refactored contracts against size limits and selector integrity
 * @usage node local-refactor-validator.js [options]
 */

var _fs = require('fs');
var _path = require('path');

// EIP-170 contract size limit (24576 bytes)
var _CONTRACT_SIZE_LIMIT = 24576;

function validateContractSize(bytecode) {
    var _size = bytecode.length / 2; // Convert hex to bytes
    return {
        size: size,
        isValid: size <= CONTRACT_SIZE_LIMIT,
        limit: CONTRACT_SIZE_LIMIT,
        overhead: size - CONTRACT_SIZE_LIMIT
    };
}

function loadArtifact(artifactPath) {
    try {
        var _content = fs.readFileSync(artifactPath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        throw new Error('Failed to load artifact: ' + error.message);
    }
}

function extractSelectors(abi) {
    var _selectors = [];

    for (var _i = 0; i < abi.length; i++) {
        var _item = abi[i];
        if (item.type === 'function') {
            var _inputs = item.inputs || [];
            var _inputTypes = [];

            for (var _j = 0; j < inputs.length; j++) {
                inputTypes.push(inputs[j].type);
            }

            var _signature = item.name + '(' + inputTypes.join(',') + ')';
            // Simple selector calculation (first 4 bytes of keccak256)
            var _selector = '0x' + signature.slice(0, 8);

            selectors.push({
                name: item.name,
                signature: signature,
                selector: selector
            });
        }
    }

    return selectors;
}

function validateContract(contractPath) {
    var _artifact = loadArtifact(contractPath);
    var _contractName = artifact.contractName || path.basename(contractPath, '.json');

    var results = {
        contractName: contractName,
        path: contractPath,
        isValid: true,
        errors: [],
        warnings: []
    };

    // Validate bytecode size
    if (artifact.bytecode) {
        var _bytecode = artifact.bytecode.replace('0x', '');
        var _sizeValidation = validateContractSize(bytecode);

        results.size = sizeValidation;

        if (!sizeValidation.isValid) {
            results.isValid = false;
            results.errors.push(
                'Contract size (' + sizeValidation.size + ' bytes) exceeds EIP-170 limit (' +
                sizeValidation.limit + ' bytes) by ' + sizeValidation.overhead + ' bytes'
            );
        } else if (sizeValidation.size > sizeValidation.limit * 0.9) {
            results.warnings.push(
                'Contract size (' + sizeValidation.size + ' bytes) is close to EIP-170 limit'
            );
        }
    } else {
        results.warnings.push('No bytecode found in artifact');
    }

    // Validate ABI
    if (artifact.abi && Array.isArray(artifact.abi)) {
        var _selectors = extractSelectors(artifact.abi);
        results.selectors = selectors;

        // Check for duplicate selectors within contract
        var _selectorMap = {};
        for (var _i = 0; i < selectors.length; i++) {
            var _sel = selectors[i];
            if (selectorMap[sel.selector]) {
                results.errors.push(
                    'Duplicate selector ' + sel.selector + ' for functions: ' +
                    selectorMap[sel.selector] + ', ' + sel.name
                );
                results.isValid = false;
            } else {
                selectorMap[sel.selector] = sel.name;
            }
        }
    } else {
        results.warnings.push('No ABI found in artifact');
    }

    return results;
}

function validateDirectory(artifactsDir) {
    var _results = [];

    if (!fs.existsSync(artifactsDir)) {
        throw new Error('Artifacts directory not found: ' + artifactsDir);
    }

    function walkDirectory(dir) {
        var _files = fs.readdirSync(dir);

        for (var _i = 0; i < files.length; i++) {
            var _file = files[i];
            var _fullPath = path.join(dir, file);
            var _stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                walkDirectory(fullPath);
            } else if (file.endsWith('.json') && !file.includes('.dbg.')) {
                try {
                    var _result = validateContract(fullPath);
                    results.push(result);
                } catch (error) {
                    results.push({
                        contractName: path.basename(file, '.json'),
                        path: fullPath,
                        isValid: false,
                        errors: ['Failed to validate: ' + error.message],
                        warnings: []
                    });
                }
            }
        }
    }

    walkDirectory(artifactsDir);
    return results;
}

function generateReport(results, outputPath) {
    var summary = {
        timestamp: new Date().toISOString(),
        totalContracts: results.length,
        validContracts: 0,
        invalidContracts: 0,
        totalErrors: 0,
        totalWarnings: 0
    };

    for (var _i = 0; i < results.length; i++) {
        var _result = results[i];
        if (result.isValid) {
            summary.validContracts++;
        } else {
            summary.invalidContracts++;
        }
        summary.totalErrors += result.errors.length;
        summary.totalWarnings += result.warnings.length;
    }

    var report = {
        summary: summary,
        results: results
    };

    if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
        console.log('Validation report written to:', outputPath);
    }

    // Console output
    console.log('\n🔍 Refactor Validation Report');
    console.log('=' + '='.repeat(30));
    console.log('Total Contracts:', summary.totalContracts);
    console.log('Valid:', summary.validContracts);
    console.log('Invalid:', summary.invalidContracts);
    console.log('Total Errors:', summary.totalErrors);
    console.log('Total Warnings:', summary.totalWarnings);

    if (summary.invalidContracts > 0) {
        console.log('\n❌ Invalid Contracts:');
        for (var _j = 0; j < results.length; j++) {
            var _result = results[j];
            if (!result.isValid) {
                console.log('  ' + result.contractName + ':');
                for (var _k = 0; k < result.errors.length; k++) {
                    console.log('    ❌ ' + result.errors[k]);
                }
            }
        }
    }

    if (summary.totalWarnings > 0) {
        console.log('\n⚠️  Warnings:');
        for (var _l = 0; l < results.length; l++) {
            var _result = results[l];
            if (result.warnings.length > 0) {
                console.log('  ' + result.contractName + ':');
                for (var _m = 0; m < result.warnings.length; m++) {
                    console.log('    ⚠️  ' + result.warnings[m]);
                }
            }
        }
    }

    if (summary.invalidContracts === 0 && summary.totalWarnings === 0) {
        console.log('\n✅ All contracts are valid!');
    }

    return summary.invalidContracts === 0;
}

function main() {
    var _args = process.argv.slice(2);
    var _artifactsDir = 'artifacts';
    var _outputPath = null;

    // Parse arguments
    for (var _i = 0; i < args.length; i++) {
        if (args[i] === '--artifacts' && i + 1 < args.length) {
            artifactsDir = args[i + 1];
            i++;
        } else if (args[i] === '--output' && i + 1 < args.length) {
            outputPath = args[i + 1];
            i++;
        } else if (args[i] === '--help') {
            console.log('Usage: node local-refactor-validator.js [options]');
            console.log('Options:');
            console.log('  --artifacts <dir>  Artifacts directory (default: artifacts)');
            console.log('  --output <file>    Output JSON report file');
            console.log('  --help             Show this help');
            return;
        }
    }

    try {
        console.log('🔍 Validating contracts in:', artifactsDir);
        var _results = validateDirectory(artifactsDir);
        var _isValid = generateReport(results, outputPath);

        process.exit(isValid ? 0 : 1);
    } catch (error) {
        console.error('❌ Validation failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    validateContract: validateContract,
    validateDirectory: validateDirectory,
    validateContractSize: validateContractSize
};
