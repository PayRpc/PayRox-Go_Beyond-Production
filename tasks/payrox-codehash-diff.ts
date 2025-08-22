import { task, types } from "hardhat/config";
import fs from "fs";
import path from "path";

type Snap = Record<string, { codehash?: string } | string>;

function isFile(p: string) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveOne(pattern: string): string {
  // If exact file exists, return
  if (isFile(pattern)) return pattern;

  // Simple wildcard support: dir/prefix*suffix.json -> pick lexicographically latest
  if (pattern.includes("*")) {
    const dir = path.dirname(pattern);
    const base = path.basename(pattern);
  const [prefixRaw, suffixRaw] = base.split("*");
  const prefix: string = prefixRaw ?? "";
  const suffix: string = suffixRaw ?? "";
    if (fs.existsSync(dir)) {
      const matches = fs
        .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
        .sort()
        .reverse();
      if (matches.length) return path.join(dir, matches[0]!);
    }
  }

  // If a directory is provided, choose the most recent JSON snapshot
  if (fs.existsSync(pattern) && fs.statSync(pattern).isDirectory()) {
    const files = fs
      .readdirSync(pattern)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(pattern, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (files.length) return files[0]!;
  }

  return pattern; // best-effort
}

function loadSnapshot(filePath: string): Record<string, string> {
  const resolved = resolveOne(filePath);
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));

  // Normalize to { facetName: "0xcodehash" }
  const map: Record<string, string> = {};

  // 1) Our artifact shape: { codehashes: [{name, codehash, ...}], ... }
  if (raw && Array.isArray(raw.codehashes)) {
    for (const item of raw.codehashes) {
      const name = item.name || item.facet || item.label;
      const ch = item.codehash || item.hash;
      if (name && typeof ch === "string") map[name] = ch.toLowerCase();
    }
    return map;
  }

  // 2) Pure array of entries
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const name = x?.name || x?.facet || x?.label;
      const ch = x?.codehash || x?.hash;
      if (name && typeof ch === "string") map[name] = ch.toLowerCase();
    }
    return map;
  }

  // 3) Mapping { facet: {codehash} } or { facet: "0x.." }
  for (const [k, v] of Object.entries(raw as Snap)) {
    if (!k || !v) continue;
    const ch = typeof v === "string" ? v : v.codehash;
    if (typeof ch === "string") map[k] = ch.toLowerCase();
  }

  return map;
}

task("payrox:codehash:diff", "Diff predictive vs observed codehash snapshots")
  .addParam("predictive", "Predictive JSON file or pattern", undefined, types.string)
  .addParam("observed", "Observed JSON file or pattern", undefined, types.string)
  .addOptionalParam("json", "Emit machine JSON", false, types.boolean)
  .setAction(async (args) => {
    const pred = loadSnapshot(args.predictive);
    const obs = loadSnapshot(args.observed);

    const names = new Set([...Object.keys(pred), ...Object.keys(obs)]);
    const missingInPred: string[] = [];
    const missingInObs: string[] = [];
    const mismatches: Array<{ facet: string; predictive?: string; observed?: string }> = [];

    for (const n of names) {
      if (!(n in pred)) missingInPred.push(n);
      if (!(n in obs)) missingInObs.push(n);
      const p = pred[n], o = obs[n];
      if (p && o && p !== o) mismatches.push({ facet: n, predictive: p, observed: o });
    }

    const ok = missingInPred.length === 0 && missingInObs.length === 0 && mismatches.length === 0;

    if (args.json) {
      console.log(JSON.stringify({ ok, mismatches, missingInPred, missingInObs }, null, 2));
    } else {
      if (ok) console.log("✅ Codehash parity: PASS");
      if (missingInPred.length) console.error("❌ Missing in predictive:", missingInPred);
      if (missingInObs.length) console.error("❌ Missing in observed:", missingInObs);
      if (mismatches.length) console.error("❌ Mismatches:", mismatches);
    }

    if (!ok) process.exit(1);
  });
