# ESLint Configuration - PERMANENT SOLUTION

## Overview
This project uses a **dual-tier ESLint strategy** to ensure code quality while accommodating legacy patterns.

## Architecture

### 1. Main Configuration (`.eslintrc.json`)
- **TypeScript files (**.ts)**: Uses `standard-with-typescript` with strict rules
- **JavaScript files (**.js)**: Uses basic `standard` config (no TypeScript rules)
- **Clean separation**: Prevents TypeScript parser conflicts with JS files

### 2. Zero-Issue Baseline
- **Purpose**: Protects intentionally exceptional legacy code patterns
- **Tool**: `tools/zeroIssueLint.cjs` 
- **Baseline**: `.quality/lint-zero-baseline.json` (currently: 0 messages)

## Scripts

```bash
npm run lint          # Fix-mode lint (TS + JS)
npm run lint:check    # Check-mode lint (TS + JS)  
npm run lint:zero     # Zero-issue baseline check
```

## Dependency Resolution

### Fixed Dependencies
- `@typescript-eslint/eslint-plugin@^6.21.0` (compatible with config)
- `@typescript-eslint/parser@^6.21.0` (compatible with config)
- `eslint-config-standard-with-typescript@^43.0.1`
- `eslint-config-standard` (for JS files)

### Why These Versions?
- `eslint-config-standard-with-typescript@43.0.1` requires `@typescript-eslint/*@^6.4.0`
- Version 7.x causes peer dependency conflicts in CI
- These versions are stable and compatible

## Current Status

### ✅ Working
- CI dependency installation (no ERESOLVE errors)
- TypeScript files: 21 legitimate style issues
- JavaScript files: Clean (no parser conflicts)
- Zero-issue baseline: 0 messages

### 🔧 Remaining Issues (21 total)
All are legitimate TypeScript style issues:
- Unused variables (prefix with `_` to fix)
- Useless constructors  
- Floating promises (add `void` or `.catch()`)
- Consistent type assertions

## CI Integration

The GitHub Actions workflow will now:
1. ✅ Install dependencies without conflicts
2. ✅ Run TypeScript checks
3. ✅ Run both lint tiers
4. ✅ Maintain zero-issue baseline

## DO NOT:
- ❌ Change TypeScript ESLint plugin versions to 7.x
- ❌ Add multiple ESLint config files
- ❌ Mix flat config with legacy config
- ❌ Apply TypeScript rules to JS files

## Maintenance:
- Fix the 21 remaining TypeScript issues gradually
- Keep zero-issue baseline at 0 messages
- Use `_` prefix for intentionally unused variables
