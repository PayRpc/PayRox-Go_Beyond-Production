# 🚨 CRITICAL FIX: Selector Collision Resolution

## **PROBLEM IDENTIFIED**
PaymentsFacet and RewardsFacet have IDENTICAL function signatures:
- `setConfig(uint256)` → 0xc3f909d4 ❌ COLLISION
- `getConfig()` → 0xf5b541a6 ❌ COLLISION
- `getState()` → Multiple collisions ❌

## **SOLUTION: NAMESPACE FUNCTIONS**

### **1. PaymentsFacet Functions (Keep Current)**
```solidity
function setPaymentConfig(uint256 newValue) external;  // Was: setConfig
function getPaymentConfig() external view returns (uint256);  // Was: getConfig
function getPaymentState() external view returns (...);  // Was: getState
```

### **2. RewardsFacet Functions (Rename)**
```solidity
function setRewardConfig(uint256 newValue) external;  // Was: setConfig
function getRewardConfig() external view returns (uint256);  // Was: getConfig
function getRewardState() external view returns (...);  // Was: getState
```

### **3. PayRoxAdminFacet Functions (Rename)**
```solidity
function setAdminConfig(uint256 newValue) external;  // Was: setConfig
function getAdminConfig() external view returns (uint256);  // Was: getConfig
function getAdminState() external view returns (...);  // Was: getState
```

## **IMPLEMENTATION PLAN**

### **Phase 1: Update Interfaces**
1. Update `IPaymentsFacet.sol` - Keep current names
2. Update `IRewardsFacet.sol` - Rename to reward-specific
3. Update `IPayRoxAdminFacet.sol` - Rename to admin-specific

### **Phase 2: Update Implementations**
1. Update `PaymentsFacet.sol` - Keep current implementations
2. Update `RewardsFacet.sol` - Rename functions and update calls
3. Update `PayRoxAdminFacet.sol` - Rename functions and update calls

### **Phase 3: Update Tests and Scripts**
1. Update all test files that reference old function names
2. Update deployment scripts
3. Update manifest generation
4. Update documentation

### **Phase 4: Verification**
1. Compile all contracts
2. Run selector collision detection
3. Run full test suite
4. Verify no remaining collisions

## **EXPECTED RESULTS**
- ✅ Zero selector collisions
- ✅ All tests pass
- ✅ Clean contract compilation
- ✅ Professional architecture
- ✅ No more "ultimate fix" commits

This fixes the ROOT CAUSE of the development chaos.
