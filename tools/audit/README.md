# PayRox Audit Consultant

Automated audit consultation and communication interface for PayRox smart contracts.

## Quick Start

```bash
# Generate comprehensive audit preparation
npm run audit:prep

# Get external auditor email template
npm run audit:template

# Get ChatGPT audit prompt (copy-paste ready)
npm run audit:chatgpt

# Generate audit checklist
npm run audit:checklist

# Interactive mode
npm run audit:interactive
```

## Features

### 🔍 Automated Audit Preparation
- Analyzes PayRox codebase structure
- Generates contract metrics and documentation
- Runs security checks (solhint, eslint, npm audit)
- Creates comprehensive audit package

### 📧 Communication Templates
- **External Auditor Template**: Professional email for hiring auditors
- **ChatGPT Prompt**: Structured prompt for AI-assisted security review
- Includes PayRox-specific context and risk areas

### ✅ Audit Checklist
- Pre-audit preparation tasks
- Contract security review points
- Diamond pattern specific checks
- PayRox-specific security areas

## Usage Examples

### Get ChatGPT Audit Prompt
```bash
npm run audit:chatgpt
```
Copy the output and paste into ChatGPT or the auditor interface.

### Prepare for External Audit
```bash
npm run audit:prep
npm run audit:template
```
This generates `audit-prep.json` with all necessary context and an email template.

### Interactive Consultation
```bash
npm run audit:interactive
```
Walks through all options and generates comprehensive audit materials.

## Generated Files

- `audit-prep.json` - Complete audit preparation package
- `audit-checklist.md` - Security review checklist
- Templates output to console for copy-paste

## Integration with External Tools

The consultant can:
- ✅ Generate structured prompts for ChatGPT
- ✅ Create professional templates for human auditors
- ✅ Package all necessary context automatically
- ✅ Run pre-audit security checks
- ✅ Format PayRox-specific risk areas and scope

## Security Focus Areas

- Diamond proxy pattern security
- Facet routing and selector collision prevention
- EIP-170 gas limit compliance
- Governance access controls
- Manifest dispatcher security
- Upgrade mechanism safety

## Command Reference

| Command | Description |
|---------|-------------|
| `audit:prep` | Generate audit preparation package |
| `audit:template` | External auditor email template |
| `audit:chatgpt` | ChatGPT consultation prompt |
| `audit:checklist` | Security audit checklist |
| `audit:interactive` | Interactive consultation mode |
