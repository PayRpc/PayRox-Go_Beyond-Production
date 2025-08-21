# PayRox Proxy Router Initialization Guide

## Overview
The `PayRoxProxyRouter` serves as a compatibility shim that allows existing proxies to route calls to a ManifestDispatcher (Diamond entry point) with enhanced security features including pause, freeze, per-selector blocking, and codehash pinning.

## Security Model
- **Salt-based initialization**: Prevents front-running attacks during proxy upgrades
- **Atomic deployment**: Must use `upgradeToAndCall` for secure initialization
- **Codehash pinning**: Optional dispatcher integrity verification
- **Emergency controls**: Pause, freeze, and per-selector kill switches

## Initialization Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner_` | address | Router admin (use msg.sender if zero) |
| `dispatcher_` | address | ManifestDispatcher contract address |
| `expectedCodehash` | bytes32 | Dispatcher's EXTCODEHASH (0x0 to disable) |
| `strictCodehash_` | bool | Enable per-call codehash verification |
| `initSalt` | bytes32 | Must be `INIT_SALT` constant (front-run protection) |

## Deployment Procedures

### 1. Pre-deployment Preparation

```typescript
// Get INIT_SALT constant (known at compile time)
const INIT_SALT = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("payrox.router.init.2024.production")
);

// Compute dispatcher codehash
const dispatcherCode = await ethers.provider.getCode(dispatcher.address);
const dispatcherCodehash = ethers.utils.keccak256(dispatcherCode);
```

### 2. Transparent Proxy (OpenZeppelin)

```typescript
// Deploy implementation
const RouterImpl = await ethers.getContractFactory("PayRoxProxyRouter");
const routerImpl = await RouterImpl.deploy();

// Prepare initialization call
const initData = router.interface.encodeFunctionData("initializeProxyRouter", [
  owner.address,           // owner_
  dispatcher.address,      // dispatcher_
  dispatcherCodehash,     // expectedCodehash
  true,                   // strictCodehash_
  INIT_SALT              // initSalt
]);

// CRITICAL: Use upgradeToAndCall for atomic initialization
await proxyAdmin.upgradeToAndCall(
  proxy.address,
  routerImpl.address,
  initData
);
```

### 3. UUPS Proxy

```typescript
// From the current proxy (must support upgradeToAndCall)
const initData = router.interface.encodeFunctionData("initializeProxyRouter", [
  owner.address,
  dispatcher.address,
  dispatcherCodehash,
  true,
  INIT_SALT
]);

await proxy.connect(upgrader).upgradeToAndCall(
  routerImpl.address,
  initData
);
```

### 4. Verification Steps

```typescript
// Verify successful initialization
const routerProxy = RouterImpl.attach(proxy.address);

console.log("Owner:", await routerProxy.owner());
console.log("Dispatcher:", await routerProxy.dispatcher());
console.log("Codehash:", await routerProxy.dispatcherCodehash());
console.log("Strict mode:", await routerProxy.strictCodehash());
console.log("Paused:", await routerProxy.paused());
console.log("Frozen:", await routerProxy.frozen());

// Test basic routing (should succeed)
await someContract.connect(user).someFacetFunction();
```

## Security Checklist

- [ ] **Never call `initializeProxyRouter` directly** - always use `upgradeToAndCall`
- [ ] **Verify INIT_SALT** matches the contract constant before deployment
- [ ] **Test with `callStatic`** first to catch revert conditions
- [ ] **Monitor initialization event** for correct parameters
- [ ] **Validate dispatcher compatibility** before setting as target
- [ ] **Document L2 governance setup** if using cross-domain features

## Emergency Procedures

### Pause Routing (Immediate)
```typescript
await router.connect(governor).setPaused(true);
```

### Forbid Specific Selectors
```typescript
const harmfulSelectors = ["0x12345678", "0x87654321"];
await router.connect(governor).setForbiddenSelectors(harmfulSelectors, true);
```

### Freeze Admin Functions (One-way)
```typescript
// PERMANENT - only pause/forbid will work after this
await router.connect(governor).freeze();
```

## L2 Cross-Domain Governance

For OP-Stack based L2s (Optimism, Base, etc.):

```typescript
const L2_MESSENGER = "0x4200000000000000000000000000000000000007"; // OP-Stack standard
const L1_GOVERNOR = "0x..."; // Your L1 governance contract

await router.connect(owner).setL2Governor(L2_MESSENGER, L1_GOVERNOR);
```

**Note**: Other L2s (Arbitrum, Polygon zkEVM) have different messenger semantics and may require adapter contracts.

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `AlreadyInitialized` | Router already initialized | Check if proxy was previously upgraded |
| `NotOwner` | Wrong salt or not authorized | Verify INIT_SALT and caller permissions |
| `IncompatibleDispatcher` | Dispatcher missing required interface | Ensure dispatcher implements `IManifestDispatcherView` |
| `DispatcherCodehashMismatch` | Code changed after init | Update codehash or disable strict mode |

## Testing Requirements

Before production deployment, verify:

1. **Init race protection**: Unauthorized party cannot initialize
2. **Pause functionality**: All routing stops when paused
3. **Selector blocking**: Specific functions can be disabled
4. **Batch execution**: Multiple calls work atomically
5. **Codehash validation**: Strict mode catches dispatcher changes
6. **Freeze behavior**: Admin functions lock except emergency controls
7. **Ownership transfer**: Two-step process works correctly

## Support

For deployment assistance or security questions, refer to:
- PayRox Protocol Documentation
- Security audit reports
- Community Discord #dev-support
