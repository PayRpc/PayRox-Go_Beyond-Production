# Fast PR Mode for Mythril Security Scanning

## Overview

Fast PR Mode provides configurable severity gating for Mythril security scans, enabling:
- **Fast PRs**: High-severity findings only (keeps PRs zippy)
- **Strict Main/Release**: Medium+High severity findings (maintains production rigor)

## Implementation Details

### Configurable Gating

The Mythril tasks now support a `--failOn` parameter:
- `--failOn high`: Only fail on High severity findings
- `--failOn medium`: Fail on Medium+High severity findings (default)

### Environment Variable Override

Set `MYTH_FAIL_ON=high` to enable Fast PR mode:
```bash
export MYTH_FAIL_ON=high
npm run sec:myth:src
```

### NPM Scripts

#### Direct Mythril Scripts
- `npm run sec:myth:src` - Source scanning (default: medium+high gate)
- `npm run sec:myth:src:pr` - Source scanning (high-only gate for PRs)
- `npm run sec:myth:addr` - Address scanning (default: medium+high gate)
- `npm run sec:myth:addr:pr` - Address scanning (high-only gate for PRs)

#### Pipeline Scripts
- `npm run pipeline:predictive` - Full predictive pipeline (medium+high gate)
- `npm run pipeline:predictive:pr` - Fast predictive pipeline (high-only gate)
- `npm run pipeline:observed` - Full observed pipeline (medium+high gate)
- `npm run pipeline:observed:pr` - Fast observed pipeline (high-only gate)

### CI Integration

#### Automatic Fast PR Mode
The CI workflow automatically enables Fast PR mode for pull requests:
```yaml
- name: Set Fast PR mode for pull requests
  if: github.event_name == 'pull_request'
  run: echo "MYTH_FAIL_ON=high" >> $GITHUB_ENV
```

#### Trigger Behavior
- **Pull Requests**: `MYTH_FAIL_ON=high` (Fast PR mode)
- **Main/Release**: Default `medium` gating (Strict mode)

### Task Configuration

Both `security:myth:src` and `security:myth:addr` tasks support:

```typescript
.addOptionalParam('failOn', 'Severity threshold for failing', 'medium', types.string)
```

The `shouldFail()` function determines blocking findings:
- `failOn=high`: Only High severity findings block
- `failOn=medium`: Both Medium and High severity findings block

### Logging Output

Enhanced status logging shows active gate level:
```
🔍 Mythril (src) gate: HIGH
✅ Mythril (src): no HIGH+ findings (0 high, 2 medium found but medium allowed)
```

```
🔍 Mythril (addr) gate: MEDIUM
❌ Mythril (addr) gate (MEDIUM) failed: 1 blocking finding(s) (0 high, 1 medium total)
```

### Hardening Features

All Fast PR mode implementations maintain:
- **Pinned Mythril Image**: `mythril/myth:0.24.6`
- **Cross-platform Support**: Docker-based execution
- **Deterministic Outputs**: BUILD_ID for reproducibility
- **SARIF Integration**: GitHub Security tab upload
- **Allowlist Filtering**: Justified exceptions via `security/allowlist.myth.json`
- **Timeout Management**: 300s source scanning, 120s address scanning

### Usage Examples

#### Local Development
```bash
# Fast scan (high-only)
npm run sec:myth:src:pr

# Strict scan (medium+high)
npm run sec:myth:src

# Manual override
MYTH_FAIL_ON=high npm run sec:myth:src
```

#### CI Pipeline
- PRs automatically use Fast PR mode
- Main/release branches use strict mode
- All scans upload SARIF to GitHub Security tab

### Benefits

1. **Developer Velocity**: PRs are not blocked by medium-severity findings
2. **Production Safety**: Main/release maintain strict medium+high gating
3. **Consistent Tooling**: Same Mythril setup across all environments
4. **Security Visibility**: All findings captured in GitHub Security tab
5. **Configurable Control**: Easy to adjust gating per environment

### Configuration Files

- `tasks/security.myth.ts` - Hardhat tasks with configurable gating
- `security/allowlist.myth.json` - Justified finding exceptions
- `tools/mythril-to-sarif.ts` - SARIF converter for GitHub integration
- `.github/workflows/ci-selfcheck.yml` - CI with automatic Fast PR mode
- `package.json` - NPM scripts for all scanning variants

This balanced approach ensures both development velocity and production security.
