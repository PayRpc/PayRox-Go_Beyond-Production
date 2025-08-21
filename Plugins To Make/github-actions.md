# GitHub Actions Integration Guide

## Action Structure

```yaml
# .github/actions/payrox-tools/action.yml
name: 'PayRox Tools'
description: 'Execute PayRox development workflows'
inputs:
  command:
    description: 'Command to execute (split|manifest|factory|safety)'
    required: true
  contract-path:
    description: 'Path to contract file for splitting'
    required: false
  output-dir:
    description: 'Output directory for generated files'
    required: false
  dispatcher-address:
    description: 'Dispatcher contract address'
    required: false
  manifest-path:
    description: 'Path to manifest JSON file'
    required: false
  rpc-url:
    description: 'RPC URL for blockchain interactions'
    required: false
  private-key:
    description: 'Private key for signing transactions'
    required: false
  gas-limit:
    description: 'Gas limit for transactions'
    required: false
    default: '500000'

runs:
  using: 'composite'
  steps:
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      shell: bash
      run: npm ci
    
    - name: Execute PayRox command
      shell: bash
      run: |
        case "${{ inputs.command }}" in
          "split")
            node scripts/tools/ast/split-facets.js "${{ inputs.contract-path }}" --out "${{ inputs.output-dir }}"
            ;;
          "manifest-apply")
            npx hardhat payrox:manifest:apply \
              --dispatcher "${{ inputs.dispatcher-address }}" \
              --manifest "${{ inputs.manifest-path }}" \
              --network "${{ inputs.network }}"
            ;;
          "safety-check")
            npx hardhat payrox:safety:check \
              --dispatcher "${{ inputs.dispatcher-address }}" \
              --network "${{ inputs.network }}"
            ;;
          *)
            echo "Unknown command: ${{ inputs.command }}"
            exit 1
            ;;
        esac
      env:
        RPC_URL: ${{ inputs.rpc-url }}
        PRIVATE_KEY: ${{ inputs.private-key }}
        GAS_LIMIT: ${{ inputs.gas-limit }}
```

## Workflow Templates

### 1. Complete CI/CD Pipeline

```yaml
# .github/workflows/payrox-pipeline.yml
name: PayRox CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  DISPATCHER_ADDRESS: ${{ secrets.DISPATCHER_ADDRESS }}
  FACTORY_ADDRESS: ${{ secrets.FACTORY_ADDRESS }}
  RPC_URL: ${{ secrets.RPC_URL }}
  PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint contracts
        run: npm run lint
      
      - name: Run tests
        run: npm test

  split-and-validate:
    needs: lint-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup environment
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Split contracts into facets
        uses: ./.github/actions/payrox-tools
        with:
          command: 'split'
          contract-path: 'contracts/MainContract.sol'
          output-dir: 'contracts/facets'
      
      - name: Validate facet compilation
        run: npx hardhat compile
      
      - name: Upload facets artifact
        uses: actions/upload-artifact@v3
        with:
          name: generated-facets
          path: contracts/facets/

  safety-checks:
    needs: split-and-validate
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup environment
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run safety checks
        uses: ./.github/actions/payrox-tools
        with:
          command: 'safety-check'
          dispatcher-address: ${{ env.DISPATCHER_ADDRESS }}
          rpc-url: ${{ env.RPC_URL }}

  deploy-staging:
    needs: [split-and-validate, safety-checks]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - uses: actions/checkout@v3
      
      - name: Download facets
        uses: actions/download-artifact@v3
        with:
          name: generated-facets
          path: contracts/facets/
      
      - name: Setup environment
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build manifest
        run: npx hardhat payrox:manifest:build --facets-dir contracts/facets --output staging-manifest.json
      
      - name: Apply manifest to staging
        uses: ./.github/actions/payrox-tools
        with:
          command: 'manifest-apply'
          dispatcher-address: ${{ secrets.STAGING_DISPATCHER_ADDRESS }}
          manifest-path: 'staging-manifest.json'
          rpc-url: ${{ secrets.STAGING_RPC_URL }}
          private-key: ${{ secrets.STAGING_PRIVATE_KEY }}

  deploy-production:
    needs: [split-and-validate, safety-checks]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v3
      
      - name: Download facets
        uses: actions/download-artifact@v3
        with:
          name: generated-facets
          path: contracts/facets/
      
      - name: Setup environment
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Final safety check
        uses: ./.github/actions/payrox-tools
        with:
          command: 'safety-check'
          dispatcher-address: ${{ env.DISPATCHER_ADDRESS }}
          rpc-url: ${{ env.RPC_URL }}
      
      - name: Build production manifest
        run: npx hardhat payrox:manifest:build --facets-dir contracts/facets --output production-manifest.json
      
      - name: Apply manifest to production
        uses: ./.github/actions/payrox-tools
        with:
          command: 'manifest-apply'
          dispatcher-address: ${{ env.DISPATCHER_ADDRESS }}
          manifest-path: 'production-manifest.json'
          rpc-url: ${{ env.RPC_URL }}
          private-key: ${{ env.PRIVATE_KEY }}
      
      - name: Commit and activate
        run: |
          npx hardhat payrox:manifest:commit --dispatcher ${{ env.DISPATCHER_ADDRESS }} --network mainnet
          npx hardhat payrox:manifest:activate --dispatcher ${{ env.DISPATCHER_ADDRESS }} --network mainnet
```

### 2. Security-Focused Workflow

```yaml
# .github/workflows/security-audit.yml
name: Security Audit

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

env:
  DISPATCHER_ADDRESS: ${{ secrets.DISPATCHER_ADDRESS }}
  RPC_URL: ${{ secrets.RPC_URL }}

jobs:
  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup environment
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run comprehensive safety checks
        id: safety
        continue-on-error: true
        run: |
          npx hardhat payrox:safety:check \
            --dispatcher ${{ env.DISPATCHER_ADDRESS }} \
            --network mainnet > safety-report.txt 2>&1
          echo "exit_code=$?" >> $GITHUB_OUTPUT
      
      - name: Check for frozen dispatcher
        run: |
          FROZEN=$(npx hardhat payrox:dispatcher:status --dispatcher ${{ env.DISPATCHER_ADDRESS }} --network mainnet | grep "frozen")
          if [[ "$FROZEN" == *"true"* ]]; then
            echo "❌ ALERT: Dispatcher is frozen when it shouldn't be"
            exit 1
          fi
      
      - name: Validate codehash integrity
        run: |
          npx hardhat payrox:codehash:verify \
            --dispatcher ${{ env.DISPATCHER_ADDRESS }} \
            --expected ${{ secrets.EXPECTED_CODEHASH }} \
            --network mainnet
      
      - name: Check selector regression
        run: |
          npx hardhat payrox:selectors:compare \
            --dispatcher ${{ env.DISPATCHER_ADDRESS }} \
            --baseline baselines/selectors.json \
            --network mainnet
      
      - name: Validate OrderedMerkle proofs
        run: |
          npx hardhat payrox:merkle:verify \
            --dispatcher ${{ env.DISPATCHER_ADDRESS }} \
            --network mainnet
      
      - name: Generate audit report
        if: always()
        run: |
          echo "# PayRox Security Audit Report" > audit-report.md
          echo "Date: $(date)" >> audit-report.md
          echo "Commit: ${{ github.sha }}" >> audit-report.md
          echo "" >> audit-report.md
          echo "## Safety Check Results" >> audit-report.md
          if [[ "${{ steps.safety.outputs.exit_code }}" == "0" ]]; then
            echo "✅ All safety checks passed" >> audit-report.md
          else
            echo "❌ Safety checks failed" >> audit-report.md
          fi
          echo "" >> audit-report.md
          echo "## Detailed Output" >> audit-report.md
          echo "\`\`\`" >> audit-report.md
          cat safety-report.txt >> audit-report.md
          echo "\`\`\`" >> audit-report.md
      
      - name: Upload audit report
        uses: actions/upload-artifact@v3
        with:
          name: security-audit-report-${{ github.run_id }}
          path: audit-report.md
      
      - name: Notify on failure
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            const { owner, repo } = context.repo;
            github.rest.issues.create({
              owner,
              repo,
              title: '🚨 Security Audit Failure',
              body: `Security audit failed on commit ${context.sha}.\n\nCheck the workflow run for details: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}`
            });
```

### 3. Factory Operations Workflow

```yaml
# .github/workflows/factory-deploy.yml
name: Factory Deployment

on:
  workflow_dispatch:
    inputs:
      deployment_type:
        description: 'Type of deployment'
        required: true
        type: choice
        options:
          - single
          - batch
      contract_name:
        description: 'Contract name (for single deployment)'
        required: false
      batch_config:
        description: 'Batch config file path'
        required: false
        default: 'config/batch-deploy.json'

env:
  FACTORY_ADDRESS: ${{ secrets.FACTORY_ADDRESS }}
  RPC_URL: ${{ secrets.RPC_URL }}
  PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup environment
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Compile contracts
        run: npx hardhat compile
      
      - name: Verify factory integrity
        run: |
          npx hardhat payrox:factory:verify \
            --factory ${{ env.FACTORY_ADDRESS }} \
            --network mainnet
      
      - name: Single deployment
        if: github.event.inputs.deployment_type == 'single'
        run: |
          # Extract bytecode for the specified contract
          BYTECODE=$(npx hardhat payrox:bytecode:extract --contract "${{ github.event.inputs.contract_name }}")
          
          # Stage bytecode
          npx hardhat payrox:factory:stage \
            --factory ${{ env.FACTORY_ADDRESS }} \
            --bytecode "$BYTECODE" \
            --network mainnet
          
          # Deploy with random salt
          SALT=$(openssl rand -hex 32)
          npx hardhat payrox:factory:deploy \
            --factory ${{ env.FACTORY_ADDRESS }} \
            --salt "0x$SALT" \
            --network mainnet
      
      - name: Batch deployment
        if: github.event.inputs.deployment_type == 'batch'
        run: |
          npx hardhat payrox:factory:batch \
            --factory ${{ env.FACTORY_ADDRESS }} \
            --config "${{ github.event.inputs.batch_config }}" \
            --network mainnet
      
      - name: Verify deployments
        run: |
          npx hardhat payrox:factory:verify-deployments \
            --factory ${{ env.FACTORY_ADDRESS }} \
            --network mainnet
```

### 4. Automated Splitting Workflow

```yaml
# .github/workflows/auto-split.yml
name: Auto Split Contracts

on:
  push:
    paths:
      - 'contracts/**/*.sol'
    branches: [ main, develop ]

jobs:
  auto-split:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Setup environment
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Detect changed contracts
        id: changes
        run: |
          CHANGED_CONTRACTS=$(git diff --name-only HEAD^ HEAD | grep "\.sol$" | grep -v "test" | grep -v "facets" || true)
          echo "contracts=$CHANGED_CONTRACTS" >> $GITHUB_OUTPUT
      
      - name: Split changed contracts
        if: steps.changes.outputs.contracts != ''
        run: |
          echo "Splitting contracts: ${{ steps.changes.outputs.contracts }}"
          for contract in ${{ steps.changes.outputs.contracts }}; do
            echo "Splitting $contract..."
            node scripts/tools/ast/split-facets.js "$contract" --out "$(dirname $contract)/facets"
          done
      
      - name: Validate generated facets
        if: steps.changes.outputs.contracts != ''
        run: npx hardhat compile
      
      - name: Create PR with facets
        if: steps.changes.outputs.contracts != ''
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'feat: auto-generated facets for modified contracts'
          title: '🤖 Auto-generated Facets'
          body: |
            This PR contains automatically generated facets for the following modified contracts:
            
            ${{ steps.changes.outputs.contracts }}
            
            Generated by: ${{ github.workflow }}
            Triggered by: ${{ github.sha }}
          branch: auto-split-${{ github.run_id }}
```

## Reusable Composite Actions

### 1. Setup PayRox Environment

```yaml
# .github/actions/setup-payrox/action.yml
name: 'Setup PayRox Environment'
description: 'Setup Node.js and install PayRox dependencies'
inputs:
  node-version:
    description: 'Node.js version to use'
    required: false
    default: '18'
  cache-key:
    description: 'Additional cache key suffix'
    required: false
    default: ''

runs:
  using: 'composite'
  steps:
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'npm'
        cache-dependency-path: package-lock.json
    
    - name: Install dependencies
      shell: bash
      run: npm ci
    
    - name: Verify PayRox tools
      shell: bash
      run: |
        echo "Verifying PayRox tools installation..."
        test -f scripts/tools/ast/split-facets.js || exit 1
        npm run audit:prep --dry-run > /dev/null || exit 1
        echo "✅ PayRox tools verified"
```

### 2. Deploy with Safety Checks

```yaml
# .github/actions/safe-deploy/action.yml
name: 'Safe Deploy'
description: 'Deploy with comprehensive safety checks'
inputs:
  dispatcher-address:
    description: 'Dispatcher contract address'
    required: true
  manifest-path:
    description: 'Path to manifest file'
    required: true
  network:
    description: 'Network to deploy to'
    required: true
  private-key:
    description: 'Private key for deployment'
    required: true

runs:
  using: 'composite'
  steps:
    - name: Pre-deployment safety check
      shell: bash
      run: |
        npx hardhat payrox:safety:check \
          --dispatcher ${{ inputs.dispatcher-address }} \
          --network ${{ inputs.network }}
    
    - name: Apply manifest
      shell: bash
      run: |
        npx hardhat payrox:manifest:apply \
          --dispatcher ${{ inputs.dispatcher-address }} \
          --manifest ${{ inputs.manifest-path }} \
          --network ${{ inputs.network }}
      env:
        PRIVATE_KEY: ${{ inputs.private-key }}
    
    - name: Post-deployment verification
      shell: bash
      run: |
        npx hardhat payrox:safety:check \
          --dispatcher ${{ inputs.dispatcher-address }} \
          --network ${{ inputs.network }}
```

## Configuration Files

### 1. Environment Template

```bash
# .env.example
# PayRox Configuration
DISPATCHER_ADDRESS=0x1234567890123456789012345678901234567890
FACTORY_ADDRESS=0x0987654321098765432109876543210987654321

# Network Configuration
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
GOERLI_RPC_URL=https://goerli.infura.io/v3/YOUR_KEY
POLYGON_RPC_URL=https://polygon-rpc.com

# Deployment Keys (use GitHub Secrets in CI)
PRIVATE_KEY=0x...
STAGING_PRIVATE_KEY=0x...

# Safety Configuration
EXPECTED_CODEHASH=0xabcdef...
BASELINE_SELECTORS_PATH=./baselines/selectors.json

# Gas Configuration
GAS_LIMIT=500000
MAX_FEE_PER_GAS=30000000000
MAX_PRIORITY_FEE_PER_GAS=2000000000
```

### 2. Hardhat Network Configuration

```javascript
// hardhat.config.js (GitHub Actions compatible)
require('dotenv').config();

module.exports = {
  networks: {
    mainnet: {
      url: process.env.MAINNET_RPC_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: parseInt(process.env.GAS_PRICE || '20000000000'),
      gas: parseInt(process.env.GAS_LIMIT || '500000'),
    },
    goerli: {
      url: process.env.GOERLI_RPC_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  payrox: {
    networks: {
      mainnet: {
        dispatcher: process.env.DISPATCHER_ADDRESS,
        factory: process.env.FACTORY_ADDRESS,
      },
      goerli: {
        dispatcher: process.env.STAGING_DISPATCHER_ADDRESS,
        factory: process.env.STAGING_FACTORY_ADDRESS,
      }
    },
    splitting: {
      defaultLibPath: '../libraries/LibDiamond.sol',
      outputDir: 'contracts/facets',
    },
    safety: {
      requiredCodehashes: {
        [process.env.DISPATCHER_ADDRESS]: process.env.EXPECTED_CODEHASH,
      },
      baselineSelectors: process.env.BASELINE_SELECTORS_PATH,
      merkleValidation: true,
    },
  },
};
```

This GitHub Actions integration provides a complete CI/CD pipeline that integrates seamlessly with your existing PayRox infrastructure while ensuring security and reliability at every step.
