# PayRox Splitter Tool

## Overview

The PayRox Splitter Tool is designed to split large smart contracts into smaller, more manageable facets for the Diamond Pattern architecture.

## Features

- **Contract Analysis**: Analyzes contract size and complexity
- **Automatic Splitting**: Splits contracts based on logical boundaries
- **Diamond Compatibility**: Ensures output is Diamond Pattern compliant
- **Selector Management**: Manages function selectors and prevents collisions

## Usage

```bash
# Split a single contract
node split-all.ts --contract contracts/LargeContract.sol

# Split all contracts in a directory
node split-all.ts --directory contracts/

# Output to specific directory
node split-all.ts --contract contracts/Large.sol --output split-contracts/
```

## Configuration

The splitter can be configured via `splitter.config.json`:

```json
{
  "maxContractSize": 20000,
  "outputDirectory": "./split-contracts",
  "preserveStorage": true,
  "generateInterfaces": true
}
```

## Output Structure

```
split-contracts/
├── OriginalContract_Part1.sol
├── OriginalContract_Part2.sol
├── interfaces/
│   ├── IOriginalContract_Part1.sol
│   └── IOriginalContract_Part2.sol
└── libraries/
    └── OriginalContractStorage.sol
```

## Best Practices

1. **Logical Separation**: Split contracts along logical function boundaries
2. **Storage Management**: Keep related storage variables together
3. **Interface Design**: Create clear interfaces for each split part
4. **Testing**: Thoroughly test split contracts before deployment

## Requirements

- Node.js 16+
- Solidity compiler
- PayRox Diamond Pattern framework

## Contributing

See the main PayRox repository for contribution guidelines.
