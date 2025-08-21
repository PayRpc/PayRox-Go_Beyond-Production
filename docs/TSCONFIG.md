Canonical TypeScript Configuration

This repository uses a single, stable TypeScript configuration for development, tests and CI.

Canonical config: `tsconfig.hardhat.json` (root)

Why this file:
- It extends `tsconfig.json` and adds test/runtime types (chai/mocha).
- Many dev scripts, CI, and jest/ts-node run with `-p tsconfig.hardhat.json` meaning it is the authoritative config for type-checks.

Places that are configured to use `tsconfig.hardhat.json`:
- package.json scripts
  - `check:ts` runs `tsc -p tsconfig.hardhat.json --noEmit`
  - `smoke:merkle` runs `ts-node -P tsconfig.hardhat.json ...`
  - `build` now runs `tsc -p tsconfig.hardhat.json` (canonicalized)
  - many tools (error-fixer, error-detector) call `npx tsc -p tsconfig.hardhat.json` internally

- Jest
  - `jest.config.js` uses `ts-jest` with `tsconfig: 'tsconfig.hardhat.json'`.

- ESLint
  - `.eslintrc.canonical.json` parserOptions.project set to `./tsconfig.hardhat.json`

- CI workflows & tools
  - Disabled and enabled CI workflow steps call `npx tsc -p tsconfig.hardhat.json --noEmit`.

Notes and recommendations
- If you need a different behavior for a specific tool (for example a separate project for the `tools/` folder), create a dedicated tsconfig in that folder (e.g. `tools/tsconfig.json`) and use `-p` for that command. By default, prefer `tsconfig.hardhat.json` for repo-level type-checks and test runs.
- `tsconfig.json` remains the base for IDEs and generic builds. It is extended by `tsconfig.hardhat.json`.

If you want I can:
- Make `tsconfig.hardhat.json` the only tsconfig by merging `tsconfig.json` into it and replacing `extends` (larger change).
- Update any remaining docs or scripts pointing to `tsconfig.json` examples.
