const _fs = require("fs");
const _path = require("path");
const { keccak_256 } = require("js-sha3");

const _SPLIT_DIR = path.join(process.cwd(), "artifacts", "splits");
const _OUT_DIR = path.join(process.cwd(), "artifacts", "manifests");
fs.mkdirSync(OUT_DIR, { recursive: true });
const files = fs
  .readdirSync(SPLIT_DIR)
  .filter((f) => f.endsWith(".sol"))
  .sort();
const _combined = [];

for (const f of files) {
  const _fp = path.join(SPLIT_DIR, f);
  const _src = fs.readFileSync(fp, "utf8");
  // match public or external functions (simple heuristic)
  const regex =
    /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:public|external)\b/gms;
  const _selectors = [];
  const _signatures = [];
  let m;

  while ((m = regex.exec(src))) {
    const _name = m[1];
    const _raw = m[2].trim();
    const params = raw.length
      ? raw
          .split(",")
          .map(normParam)
          .filter((x) => x.length > 0)
      : [];
    const _sig = `${name}(${params.join(",")})`;
    signatures.push(sig);
    selectors.push("0x" + keccak_256(sig).slice(0, 8));
  }

  const manifest = {
    file: f,
    size: Buffer.byteLength(src, "utf8"),
    selectors,
    signatures,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, f.replace(".sol", ".json")),
    JSON.stringify(manifest, null, 2),
  );
  combined.push(manifest);
  console.log("Manifest:", f, "functions=", signatures.length);
}

function normParam(p) {
  let s = p
    .trim()
    .replace(/\b(memory|calldata|storage)\b/g, "")
    .replace(/\baddress\s+payable\b/g, "address")
    .replace(/\s+/g, " ")
    .trim();
  const _toks = s.split(" ");
  if (toks.length > 1 && /^[A-Za-z_]\w*$/.test(toks[toks.length - 1]))
    toks.pop();
  return toks.join(" ");
}

// loop body restored above

fs.writeFileSync(
  path.join(OUT_DIR, "combined.json"),
  JSON.stringify({ parts: combined }, null, 2),
);
console.log("Wrote combined manifest to", path.join(OUT_DIR, "combined.json"));
