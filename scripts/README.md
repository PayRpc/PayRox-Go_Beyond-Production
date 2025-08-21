Gas fixture — applyRoutes

Purpose

This script (`gas-fixture-applyRoutes.ts`) compiles and deploys a minimal ManifestDispatcher + facet fixture and produces gas estimates for:
- `applyRoutes(...)`
- `activateCommittedRoot()`

It is intended for quick, reproducible gas profiling during development.

Requirements

- Node.js + npm and the repo's dependencies installed
- Hardhat configured for the target network

Quick examples

# Run on the default Hardhat network (fast, local)
npx hardhat run scripts/gas-fixture-applyRoutes.ts

# Forward CLI args (Unix shells) — set activation delay and a selector
npx hardhat run scripts/gas-fixture-applyRoutes.ts -- --activation-delay=3600 --selector="minimal(bytes)"

# PowerShell: pass an output path using an environment variable (Hardhat may capture flags)
$env:OUT="reports/monitoring/latest.json"; npx hardhat run scripts/gas-fixture-applyRoutes.ts; Remove-Item Env:OUT

Supported options

- `--activation-delay=<seconds>` (or `--activationDelay`)
  - Override the dispatcher's activation delay used in the fixture (default: `0` in the script).
- `--selector=<0x... | signature>`
  - Provide a selector (0x-prefixed) or a function signature (e.g. `"minimal(bytes)"`).
- `--no-report`
  - Skip writing the JSON report file.
- `--out=<path>` / `--output=<path>`
  - Output path for the JSON report. On Windows PowerShell prefer setting `OUT` env var instead.

Report output

By default the script writes a JSON report to `reports/monitoring/gas_estimate-<network>-<timestamp>.json`.
The report contains: network, deployer, dispatcher address, facet address, committed root, epoch, activation delay, and stringified gas estimates.

Notes & troubleshooting

- Hardhat captures some CLI flags. If passing arguments via `--` does not work on your shell, use environment variables (PowerShell example above) or run the script directly with `node` after compiling.
- If `ExampleFacetA` fails to compile or link, the script falls back to using the deployer address for the facet (this may cause `applyRoutes` to revert -- see logs). Prefer compiling and keeping `contracts/facets/ExampleFacetA.sol` available.
- For activation estimation, set `--activation-delay=0` or use a fixture with immediate activation.

If you'd like, I can add a `--history` mode to append results to a single CSV/JSON for trend analysis, or commit a sample report into `reports/monitoring/`.
