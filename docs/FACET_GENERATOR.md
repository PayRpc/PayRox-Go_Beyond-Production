# PayRox Facet Generator Toolkit

A comprehensive toolkit for generating production-ready Diamond facets for the PayRox system. This toolkit provides:

- **CLI Generator**: Creates 3 files (interface, storage library, facet contract)
- **Hardhat Task**: Initializes facets via Diamond/Dispatcher
- **Manifest Patcher**: Auto-adds routes to your manifest files
- **Smoke Test**: Validates generated facet structure

## 🚀 Quick Start

### 1. Generate a New Facet

```bash
# Generate a new facet (e.g., Payments, Governance, Rewards)
npm run new:facet <FacetName>

# Example:
npm run new:facet Payments
```

This creates:
- `contracts/interfaces/IPaymentsFacet.sol` - Interface definition
- `contracts/libraries/PaymentsStorage.sol` - Diamond-safe storage library  
- `contracts/facets/PaymentsFacet.sol` - Main facet implementation

### 2. Compile

```bash
npm run compile
```

### 3. Add Routes to Manifest

```bash
# Add facet routes to manifest
npm run routes:add <FacetName> [manifest.json] [facetAddress]

# Example:
npm run routes:add Payments manifest.local.json 0xFacetAddressPlaceholder
```

### 4. Initialize via Diamond/Dispatcher

```bash
# Initialize the facet through the Diamond system
npx hardhat facet:init --name <FacetName> --operator <OperatorAddress> --diamond <DiamondAddress>

# Example:
npx hardhat facet:init --name Payments --operator 0x742d35Cc6615C300532c7C0c3D73d48d3cd3A5A5 --diamond 0xDiamondAddress
```

## 📋 Generated Facet Features

### Diamond-Safe Architecture
- ✅ **Namespaced Storage**: Uses `keccak256("payrox.facets.{name}.v1")` storage slots
- ✅ **One-time Initialization**: Prevents double-initialization
- ✅ **Diamond-Compatible**: Works via delegatecall in Diamond proxy

### PayRox Integration
- ✅ **Access Control**: Integrates with `PayRoxAccessControlStorage`
- ✅ **Pause Mechanism**: Respects global pause state via `PayRoxPauseStorage`
- ✅ **Role-Based Security**: Admin and operator role checks

### Standards Compliance
- ✅ **ERC-165**: Interface detection support
- ✅ **Manifest-Friendly**: `getFacetInfo()` for tooling integration
- ✅ **Gas Optimized**: Efficient storage patterns and operations

## 🏗️ Generated File Structure

### Interface (`contracts/interfaces/I{Name}Facet.sol`)
```solidity
interface IPaymentsFacet {
    event PaymentsInitialized(address operator);
    event PaymentsConfigSet(uint256 newValue, address indexed by);
    
    function initializePayments(address operator) external;
    function setConfig(uint256 newValue) external;
    function getConfig() external view returns (uint256);
    function getFacetInfo() external pure returns (string memory, string memory, bytes4[] memory);
}
```

### Storage Library (`contracts/libraries/{Name}Storage.sol`)
```solidity
library PaymentsStorage {
    bytes32 internal constant SLOT = keccak256("payrox.facets.payments.v1");
    
    struct Layout {
        bool initialized;
        address operator;
        uint256 config;
        uint256 ops;
        address lastCaller;
    }
}
```

### Facet Contract (`contracts/facets/{Name}Facet.sol`)
- Inherits from interface
- Implements PayRox access control patterns
- Includes pause functionality
- Provides role-based operation security
- ERC-165 compliant
- Manifest tooling support

## 🧪 Testing

### Smoke Test
```bash
# Run the basic structure test
npx hardhat test test/Facet.smoke.ts
```

### Custom Tests
Create tests in `test/` directory following this pattern:
```typescript
describe('PaymentsFacet', () => {
  it('should initialize and operate correctly', async () => {
    // Your test logic here
  });
});
```

## 🔧 Customization

### Extending Functionality
1. **Add new functions**: Edit the generated facet contract
2. **Update interface**: Add function signatures to the interface
3. **Expand storage**: Add fields to the storage layout struct
4. **Add events**: Define new events for your operations

### Example: Adding a new function
```solidity
// In IPaymentsFacet.sol
function processPayment(address to, uint256 amount) external;

// In PaymentsFacet.sol
function processPayment(address to, uint256 amount) external whenNotPaused onlyOperator {
    S.Layout storage l = S.layout();
    // Your payment logic here
    unchecked { l.ops += 1; }
    l.lastCaller = msg.sender;
}
```

## 📦 Files Created by Toolkit

```
scripts/
├── generators/
│   └── new-facet.ts           # CLI generator
└── manifest/
    └── add-facet-routes.ts    # Route patcher

tasks/
└── facet-init.ts              # Hardhat initialization task

test/
└── Facet.smoke.ts             # Basic smoke test

contracts/
├── interfaces/I{Name}Facet.sol
├── libraries/{Name}Storage.sol
└── facets/{Name}Facet.sol
```

## 🎯 Best Practices

### Development Workflow
1. **Generate** facet with descriptive name
2. **Customize** the template to your needs
3. **Test** functionality with unit tests
4. **Compile** and verify no errors
5. **Add routes** to your manifest
6. **Deploy** through your deployment pipeline
7. **Initialize** via Diamond/Dispatcher

### Security Considerations
- ✅ Always use the admin role for initialization
- ✅ Implement proper operator checks for sensitive functions
- ✅ Respect pause state for operational functions
- ✅ Use proper error handling and validation
- ✅ Test storage collisions in diamond environment

### Gas Optimization
- ✅ Use `unchecked` blocks for safe arithmetic
- ✅ Pack storage variables efficiently
- ✅ Minimize external calls
- ✅ Use events for off-chain indexing

## 🚨 Important Notes

1. **Diamond Context**: Generated facets are designed to work within the PayRox Diamond system. Standalone deployment may require modifications.

2. **Storage Safety**: The namespaced storage pattern prevents collisions but requires consistent slot naming across upgrades.

3. **Access Control**: Facets rely on PayRox's centralized access control system. Ensure proper role setup in your Diamond.

4. **Testing**: Full integration testing should be done within a complete Diamond environment.

## 🛠️ Troubleshooting

### Common Issues

**Compilation Errors**
- Ensure PayRox storage libraries exist
- Check import paths in generated files
- Verify Solidity version compatibility

**Initialization Failures**
- Confirm admin role is properly set
- Verify Diamond address is correct
- Check operator address is valid

**Route Addition Problems**
- Ensure facet is compiled first
- Check artifact files exist
- Verify manifest path is correct

## 🔄 Upgrade Path

When upgrading facets:
1. Preserve storage layout compatibility
2. Update version in `getFacetInfo()`
3. Test thoroughly in staging environment
4. Update manifest with new selectors
5. Re-initialize if storage changes

---

**Generated by PayRox Facet Generator v1.0.0**  
Ready-to-use, Diamond-safe, PayRox-integrated facet templates.
