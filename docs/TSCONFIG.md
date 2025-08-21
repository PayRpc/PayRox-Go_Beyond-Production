# Canonical TypeScript Configuration - UNIFIED ✅

This repository uses a **single, unified TypeScript configuration** for all development, testing, and CI operations.

## 🎯 Canonical Configuration

**File**: `tsconfig.hardhat.json` (root)

This is the **single source of truth** for all TypeScript compilation in the PayRox project.

## 🔧 What Uses the Canonical Config

### Package.json Scripts

- `check:ts` runs `tsc -p tsconfig.hardhat.json --noEmit`
- `smoke:merkle` runs `ts-node -P tsconfig.hardhat.json ...`
- `build` runs `tsc -p tsconfig.hardhat.json`

### Build Tools & Testing

- **Jest**: `jest.config.js` uses `ts-jest` with `tsconfig: 'tsconfig.hardhat.json'`
- **ESLint**: `.eslintrc.canonical.json` parserOptions.project uses `./tsconfig.hardhat.json`
- **All error-fixing tools**: Use `npx tsc -p tsconfig.hardhat.json --noEmit`

### CI Workflows

- GitHub Actions workflows use `npx tsc -p tsconfig.hardhat.json --noEmit`

## 📁 IDE Compatibility

**File**: `tsconfig.json` → Simple stub that extends `tsconfig.hardhat.json`

This exists purely for IDE/editor TypeScript language service compatibility while maintaining the unified configuration.

## 🏗️ Separate Projects

- **AI Assistant Backend**: `tools/ai-assistant/backend/tsconfig.json` (independent project)

## ✅ Unification Complete

- ✅ Single canonical configuration source
- ✅ All build tools unified
- ✅ All CI workflows unified  
- ✅ IDE compatibility maintained
- ✅ No configuration drift possible
