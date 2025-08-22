#!/usr/bin/env node
/**
 * @fileoverview Generate function selector signatures for PayRox contracts
 * @description Extracts and generates function signatures from contract ABIs
 * @usage node generate-selector-signatures.js [options]
 */

var _fs = require('fs');
var _path = require('path');
var _crypto = require('crypto');

function keccak256(data) {
    return crypto.createHash('keccak256').update(data).digest('hex');
}

function generateSelector(signature) {
    var _hash = keccak256(signature);
    return '0x' + hash.substring(0, 8);
}

function extractFunctionsFromABI(abi) {
    var _functions = [];

    for (var _i = 0; i < abi.length; i++) {
        var _item = abi[i];
        if (item.type === 'function') {
            var _inputs = item.inputs || [];
            var _inputTypes = [];

            for (var _j = 0; j < inputs.length; j++) {
                inputTypes.push(inputs[j].type);
            }

            var _signature = item.name + '(' + inputTypes.join(',') + ')';
            var _selector = generateSelector(signature);

            functions.push({
                name: item.name,
                signature: signature,
                selector: selector,
                stateMutability: item.stateMutability || 'nonpayable'
            });
        }
    }

    return functions;
}

function processArtifactsDirectory(artifactsDir) {
    var _results = {};

    if (!fs.existsSync(artifactsDir)) {
        console.error('Artifacts directory not found:', artifactsDir);
        return results;
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
                    var _content = fs.readFileSync(fullPath, 'utf8');
                    var _artifact = JSON.parse(content);

                    if (artifact.abi && Array.isArray(artifact.abi)) {
                        var _contractName = artifact.contractName || path.basename(file, '.json');
                        var _functions = extractFunctionsFromABI(artifact.abi);

                        if (functions.length > 0) {
                            results[contractName] = functions;
                        }
                    }
                } catch (error) {
                    console.warn('Error processing', fullPath, ':', error.message);
                }
            }
        }
    }

    walkDirectory(artifactsDir);
    return results;
}

function generateReport(results, outputPath) {
    var report = {
        timestamp: new Date().toISOString(),
        totalContracts: Object.keys(results).length,
        contracts: results
    };

    if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
        console.log('Report written to:', outputPath);
    } else {
        console.log(JSON.stringify(report, null, 2));
    }

    // Generate summary
    var _totalFunctions = 0;
    var _selectorMap = {};

    for (var contractName in results) {
        var _functions = results[contractName];
        totalFunctions += functions.length;

        for (var _i = 0; i < functions.length; i++) {
            var _func = functions[i];
            if (selectorMap[func.selector]) {
                selectorMap[func.selector].push(contractName + '.' + func.name);
            } else {
                selectorMap[func.selector] = [contractName + '.' + func.name];
            }
        }
    }

    console.log('\n📊 Summary:');
    console.log('  Contracts:', Object.keys(results).length);
    console.log('  Total Functions:', totalFunctions);

    // Check for selector collisions
    var _collisions = [];
    for (var selector in selectorMap) {
        if (selectorMap[selector].length > 1) {
            collisions.push({
                selector: selector,
                functions: selectorMap[selector]
            });
        }
    }

    if (collisions.length > 0) {
        console.log('  ⚠️  Selector Collisions:', collisions.length);
        for (var _j = 0; j < collisions.length; j++) {
            var _collision = collisions[j];
            console.log('    ' + collision.selector + ':', collision.functions.join(', '));
        }
    } else {
        console.log('  ✅ No selector collisions detected');
    }
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
            console.log('Usage: node generate-selector-signatures.js [options]');
            console.log('Options:');
            console.log('  --artifacts <dir>  Artifacts directory (default: artifacts)');
            console.log('  --output <file>    Output JSON file (default: stdout)');
            console.log('  --help             Show this help');
            return;
        }
    }

    console.log('🔍 Processing artifacts in:', artifactsDir);
    var _results = processArtifactsDirectory(artifactsDir);
    generateReport(results, outputPath);
}

if (require.main === module) {
    main();
}

module.exports = {
    generateSelector: generateSelector,
    extractFunctionsFromABI: extractFunctionsFromABI,
    processArtifactsDirectory: processArtifactsDirectory
};
