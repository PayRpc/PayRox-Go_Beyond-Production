# CREATE2 CI/CD Integration Examples

## GitHub Actions Workflow

```yaml
# .github/workflows/deploy-create2.yml
name: CREATE2 Deterministic Deployment

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  # Secrets should be configured in GitHub repository settings
  SEPOLIA_RPC_URL: ${{ secrets.SEPOLIA_RPC_URL }}
  MAINNET_RPC_URL: ${{ secrets.MAINNET_RPC_URL }}
  PRIVATE_KEY: ${{ secrets.DEPLOY_PRIVATE_KEY }}

jobs:
  create2-preflight:
    runs-on: ubuntu-latest
    name: CREATE2 Preflight Checks
    
    strategy:
      matrix:
        network: [sepolia, mainnet]
        
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Compile contracts
        run: npx hardhat compile
        
      - name: CREATE2 Preflight Check - ${{ matrix.network }}
        env:
          NETWORK: ${{ matrix.network }}
        run: |
          npx hardhat create2:check \
            --network ${{ matrix.network }} \
            --factory ${{ secrets[format('FACTORY_ADDR_{0}', upper(matrix.network))] }} \
            --dispatcher ${{ secrets[format('DISPATCHER_ADDR_{0}', upper(matrix.network))] }} \
            --expectedfactorycodehash ${{ secrets[format('FACTORY_CH_{0}', upper(matrix.network))] }} \
            --expecteddispatchercodehash ${{ secrets[format('DISPATCHER_CH_{0}', upper(matrix.network))] }} \
            --contract DeterministicChunkFactory \
            --argsjson '${{ secrets.DCF_ARGS_JSON }}' \
            --salt ${{ secrets.DCF_SALT }}
            
      - name: Cross-network consistency check
        if: matrix.network == 'sepolia' # Run once
        run: |
          echo "Verifying CREATE2 consistency across networks..."
          npx hardhat run scripts/cross-chain-create2-verify.ts
          
  deploy:
    needs: create2-preflight
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    strategy:
      matrix:
        network: [sepolia, mainnet]
        
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Deploy with CREATE2 verification
        env:
          NETWORK: ${{ matrix.network }}
        run: |
          npx hardhat crosschain:deploy \
            --network ${{ matrix.network }} \
            --verify-create2 \
            --config deploy-config-${{ matrix.network }}.json
            
      - name: Post-deployment verification
        run: |
          npx hardhat create2:verify-deployment \
            --network ${{ matrix.network }} \
            --deployment-file deployments/${{ matrix.network }}.json
```

## GitLab CI Example

```yaml
# .gitlab-ci.yml
stages:
  - preflight
  - deploy
  - verify

variables:
  NODE_VERSION: "20"

.hardhat_base: &hardhat_base
  image: node:${NODE_VERSION}
  before_script:
    - npm ci
    - npx hardhat compile
  cache:
    paths:
      - node_modules/
      - artifacts/
      - cache/

create2_preflight:
  <<: *hardhat_base
  stage: preflight
  parallel:
    matrix:
      - NETWORK: [sepolia, mainnet]
  script:
    - echo "Running CREATE2 preflight for $NETWORK"
    - |
      npx hardhat create2:check \
        --network $NETWORK \
        --factory $FACTORY_ADDR \
        --dispatcher $DISPATCHER_ADDR \
        --expectedfactorycodehash $FACTORY_CODEHASH \
        --expecteddispatchercodehash $DISPATCHER_CODEHASH \
        --contract DeterministicChunkFactory \
        --argsjson "$CONSTRUCTOR_ARGS" \
        --salt $SALT_BYTES32
  variables:
    FACTORY_ADDR: ${FACTORY_ADDR_${NETWORK}}
    DISPATCHER_ADDR: ${DISPATCHER_ADDR_${NETWORK}}
    FACTORY_CODEHASH: ${FACTORY_CH_${NETWORK}}
    DISPATCHER_CODEHASH: ${DISPATCHER_CH_${NETWORK}}

deploy_create2:
  <<: *hardhat_base
  stage: deploy
  dependencies:
    - create2_preflight
  parallel:
    matrix:
      - NETWORK: [sepolia, mainnet]
  script:
    - npx hardhat crosschain:deploy --network $NETWORK --verify-create2
  artifacts:
    paths:
      - deployments/
    expire_in: 1 week
  only:
    - main
```

## Docker Integration

```dockerfile
# Dockerfile.create2-verify
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Copy hardhat config and contracts
COPY hardhat.config.ts ./
COPY tsconfig*.json ./
COPY contracts/ ./contracts/
COPY src/ ./src/
COPY tasks/ ./tasks/

# Compile contracts
RUN npx hardhat compile

# CREATE2 verification script
COPY scripts/create2-verify.sh ./
RUN chmod +x create2-verify.sh

ENTRYPOINT ["./create2-verify.sh"]
```

## Jenkins Pipeline Example

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        NODE_VERSION = '20'
        FACTORY_ADDR = credentials('factory-address')
        DISPATCHER_ADDR = credentials('dispatcher-address')
        SALT = credentials('deployment-salt')
    }
    
    stages {
        stage('Setup') {
            steps {
                nvm("${NODE_VERSION}") {
                    sh 'npm ci'
                    sh 'npx hardhat compile'
                }
            }
        }
        
        stage('CREATE2 Preflight') {
            parallel {
                stage('Sepolia Preflight') {
                    steps {
                        nvm("${NODE_VERSION}") {
                            sh '''
                                npx hardhat create2:check \
                                    --network sepolia \
                                    --factory $FACTORY_ADDR \
                                    --dispatcher $DISPATCHER_ADDR \
                                    --contract DeterministicChunkFactory \
                                    --salt $SALT
                            '''
                        }
                    }
                }
                stage('Mainnet Preflight') {
                    steps {
                        nvm("${NODE_VERSION}") {
                            sh '''
                                npx hardhat create2:check \
                                    --network mainnet \
                                    --factory $FACTORY_ADDR \
                                    --dispatcher $DISPATCHER_ADDR \
                                    --contract DeterministicChunkFactory \
                                    --salt $SALT
                            '''
                        }
                    }
                }
            }
        }
        
        stage('Deploy') {
            when { branch 'main' }
            steps {
                nvm("${NODE_VERSION}") {
                    sh 'npx hardhat crosschain:deploy --verify-create2'
                }
            }
        }
    }
    
    post {
        always {
            archiveArtifacts artifacts: 'deployments/**', allowEmptyArchive: true
        }
        failure {
            emailext (
                subject: "CREATE2 Deployment Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                body: "CREATE2 verification or deployment failed. Check console output.",
                to: "${env.TEAM_EMAIL}"
            )
        }
    }
}
```

## Usage Examples

### Basic CREATE2 Check
```bash
# Check a contract deployment
npx hardhat create2:check \
  --network sepolia \
  --factory 0x123... \
  --salt 0xabc... \
  --contract MyContract \
  --argsjson '["arg1", "arg2"]'
```

### Full Verification with Expected Values
```bash
# Full verification with all checks
npx hardhat create2:check \
  --network mainnet \
  --factory 0x123... \
  --dispatcher 0x456... \
  --expectedfactorycodehash 0xdef... \
  --expecteddispatchercodehash 0x789... \
  --expectedaddress 0xabc... \
  --salt 0x111... \
  --contract DeterministicChunkFactory \
  --argsjson '["0xFEE", "0xDISP", "0xHASH", "0xCH", "0xFH", "1000000", true]'
```

### Using Raw Bytecode
```bash
# Check with raw bytecode
npx hardhat create2:check \
  --factory 0x123... \
  --salt 0xabc... \
  --bytecodehex 0x608060405... \
  --constructortypes '["address", "uint256"]' \
  --constructorargsjson '["0x123...", "1000"]'
```

### CI/CD Integration Variables

Set these as secrets/environment variables in your CI system:

```bash
# Network-specific addresses
FACTORY_ADDR_SEPOLIA=0x...
FACTORY_ADDR_MAINNET=0x...
DISPATCHER_ADDR_SEPOLIA=0x...
DISPATCHER_ADDR_MAINNET=0x...

# Expected codehashes for verification
FACTORY_CH_SEPOLIA=0x...
FACTORY_CH_MAINNET=0x...
DISPATCHER_CH_SEPOLIA=0x...
DISPATCHER_CH_MAINNET=0x...

# Deployment parameters
DCF_SALT=0x1111111111111111111111111111111111111111111111111111111111111111
DCF_ARGS_JSON='["0xFEERECIPIENT","0xDISPATCHER","0xMANIFEST_HASH","0xDISPATCHER_CH","0xFACTORY_HASH","1000000000000000",true]'

# RPC endpoints
SEPOLIA_RPC_URL=https://...
MAINNET_RPC_URL=https://...

# Deployment keys
DEPLOY_PRIVATE_KEY=0x...
```
