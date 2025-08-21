#!/usr/bin/env node
/**
 * @fileoverview Manifest comparison utility for PayRox
 * @description Compares two manifest files and reports differences
 * @usage node diff-manifests.js <manifest1> <manifest2>
 */

var fs = require('fs');

function loadManifest(filePath) {
    try {
        var content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error loading manifest ' + filePath + ':', error.message);
        process.exit(1);
    }
}

function compareManifests(manifest1, manifest2) {
    var diffs = [];

    // Compare facets
    var facets1 = manifest1.facets || {};
    var facets2 = manifest2.facets || {};

    var allFacetKeys1 = Object.keys(facets1);
    var allFacetKeys2 = Object.keys(facets2);
    var allFacets = {};

    for (var i = 0; i < allFacetKeys1.length; i++) {
        allFacets[allFacetKeys1[i]] = true;
    }
    for (var j = 0; j < allFacetKeys2.length; j++) {
        allFacets[allFacetKeys2[j]] = true;
    }

    var facetNames = Object.keys(allFacets);

    for (var k = 0; k < facetNames.length; k++) {
        var facetName = facetNames[k];
        var facet1 = facets1[facetName];
        var facet2 = facets2[facetName];

        if (!facet1) {
            diffs.push('+ Facet added: ' + facetName);
        } else if (!facet2) {
            diffs.push('- Facet removed: ' + facetName);
        } else {
            // Compare facet details
            if (facet1.address !== facet2.address) {
                diffs.push('~ Facet ' + facetName + ' address changed: ' + facet1.address + ' -> ' + facet2.address);
            }
            if (JSON.stringify(facet1.selectors) !== JSON.stringify(facet2.selectors)) {
                diffs.push('~ Facet ' + facetName + ' selectors changed');
            }
        }
    }

    // Compare version
    if (manifest1.version !== manifest2.version) {
        diffs.push('~ Version changed: ' + manifest1.version + ' -> ' + manifest2.version);
    }

    return diffs;
}

function main() {
    var args = process.argv.slice(2);

    if (args.length !== 2) {
        console.error('Usage: node diff-manifests.js <manifest1> <manifest2>');
        process.exit(1);
    }

    var file1 = args[0];
    var file2 = args[1];

    if (!fs.existsSync(file1)) {
        console.error('File not found: ' + file1);
        process.exit(1);
    }

    if (!fs.existsSync(file2)) {
        console.error('File not found: ' + file2);
        process.exit(1);
    }

    var manifest1 = loadManifest(file1);
    var manifest2 = loadManifest(file2);

    var diffs = compareManifests(manifest1, manifest2);

    if (diffs.length === 0) {
        console.log('✅ Manifests are identical');
    } else {
        console.log('📋 Found ' + diffs.length + ' difference(s):');
        diffs.forEach(function(diff) {
            console.log('  ' + diff);
        });
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    compareManifests: compareManifests,
    loadManifest: loadManifest
};
