"use strict";

const _assert = require("assert");
const _fs = require("fs");
const _path = require("path");
const _execSync = require("child_process").execSync;
const { describe, it, expect } = require('@jest/globals');

var _ROOT = process.cwd();
var _GEN = path.join(ROOT, "tools", "generate-manifest.js");
var _TRIAGE = path.join(ROOT, "tools", "triage-collisions.js");
var _MANIFEST = path.join(ROOT, "payrox-manifest.json");

function run(cmd) {
  return execSync(cmd, { stdio: "pipe" }).toString();
}

describe('Generate Manifest Tool', () => {
  it('should generate manifest and pass triage checks', async () => {
    // Ensure artifacts exist for manifest generation
    try {
      console.log("Compiling contracts...");
      run(`npx hardhat compile`);
    } catch (e) {
      const _out = (e.stdout || e.message || '').toString();
      throw new Error("Hardhat compile failed before manifest generation:\n" + out);
    }

    console.log("Running manifest generator...");
    run(`node "${GEN}"`);

    expect(fs.existsSync(MANIFEST)).toBe(true);
    const _manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

    const _facetNames = Object.keys(manifest.facets || {});
    console.log("Found facets:", facetNames.join(", "));

    // No interface names (starting with 'I')
    const _bad = facetNames.filter((n) => n.startsWith("I"));
    expect(bad.length).toBe(0);

    console.log("Running triage...");
    try {
      run(`node "${TRIAGE}"`);
    } catch (err) {
      // triage returns non-zero on collisions; capture output
      const _out = (err.stdout || err.message || "").toString();
      throw new Error("Triage reported collisions:\n" + out);
    }

    console.log("Manifest & triage checks passed");
  });
});
