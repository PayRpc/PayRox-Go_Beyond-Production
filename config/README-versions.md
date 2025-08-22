# Single source of truth for toolchain versions

- Node: read from .github/workflows env NODE_VERSION (currently 20)
- Python: read from .github/workflows env PYTHON_VERSION (currently 3.11)
- Solidity: 0.8.30 (set in hardhat.config.ts and foundry.toml)
- TypeScript: tsconfig.hardhat.json governs all tools; tsconfig.json simply extends it for IDEs
- Ethers: v6 (package.json)

Do not change versions ad hoc in CI jobs or scripts; update the canonical files:
- Hardhat/Foundry: hardhat.config.ts, foundry.toml

- TypeScript: tsconfig.hardhat.json

- CI default versions: .github/workflows/production-ci.yml
