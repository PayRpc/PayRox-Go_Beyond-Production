# Customer Facet Integration Guide (Production-Ready)

## What this covers

- Creating a new facet (code + storage + interface)
- Wiring routes/selectors into the manifest
- Deterministic address (CREATE2 salt) & codehash parity
- Loupe parity, EIP-170, Mythril gates
- Commit/apply with delay & post-apply checks

## 0) Prerequisites (one-time)

- Hardhat node or target network RPC available
- Docker installed (for Mythril in strict mode)
- Env for signing if releasing: `SIGNER_KEY`, `DISPATCHER_ADDR` (optional on dev)

## 1) Generate facet scaffolding

```bash
# Create facet, interface, storage (your generator)
npm run new:facet Customer   # or MyBusinessLogic
```

This produces:

- `contracts/facets/CustomerFacet.sol`
- `contracts/interfaces/ICustomerFacet.sol`
- `contracts/libraries/CustomerStorage.sol`

### Storage layout rule (critical)

Use diamond storage only; never inherit storage from other facets. Example pattern:

```solidity
library CustomerStorage {
    bytes32 internal constant SLOT = keccak256("payrox.customer.v1");
    struct Layout {
        address operator;
        uint256 config;
        // add fields here
    }
    function layout() internal pure returns (Layout storage l) {
        bytes32 s = SLOT;
        assembly { l.slot := s }
    }
}
```

## 2) Compile & ABI types

```bash
npm run compile
# optional: generate types
npm run typechain
```

## 3) Wire routes/selectors into the manifest

Use your existing script. Two supported forms:

**A. Name-only (default path):**

```bash
npx ts-node scripts/manifest/add-facet-routes.ts Customer
```

**B. Explicit (matches your earlier usage):**

```bash
npx ts-node --transpile-only scripts/manifest/add-facet-routes.ts Customer manifest.local.json <DiamondOrDispatcherAddr>
```

This appends selectors for: `supportsInterface`, `getFacetInfo`, plus your business functions (e.g., `getConfig`, `setConfig`, `initializeCustomer`, etc.).

## 4) Predictive pipeline (build plan, salts, proofs, codehashes)

```bash
npm run pipeline:predictive
```

This will:

- Extract selectors → `split-output/selectors.json`
- Allocate CREATE2 salts (if enabled) and include them in `deployment-plan.json`
- Compute predicted codehashes → `codehashes-predictive-*.json`
- Build Merkle proofs → `proofs.json`
- Run Mythril (src) if Docker present (gated)
- Write SHA256SUMS

**Salt policy:** keep it deterministic (e.g., `salt = keccak256(chainId || facetName || version)`). Your deploy step must enforce the same salt so predictive == observed.

## 5) Deploy facet(s)

**Local:**

```bash
npx hardhat run scripts/deploy/deploy-facet.js
```

**Or via your release pipeline on a real network:**

```bash
npm run release -- <network> --skip-commit   # if you only want facet deploy now
```

If you're using your `DeterministicChunkFactory/CREATE2` step, ensure:

- `deployment-plan.json` contains the salt per facet
- The deploy task uses that exact salt and checks EXTCODEHASH against predicted

## 6) Observed pipeline (capture on-chain codehashes, build observed Merkle)

```bash
npm run pipeline:observed
```

This will:

- Read `deployed-addresses.json`
- Produce `codehashes-observed-*.json`
- Rebuild Merkle from observed mapping
- Auto-diff predictive vs observed (fail on drift)
- Run Mythril (addr) when Docker present (gated)

## 7) Validation gates (auto-run in your pipelines)

- **Codehash parity:** predictive vs observed → must match
- **Selector parity:** count & mapping must match after interface-only pruning
- **EIP-170:** each facet < 24KB with headroom
- **Loupe parity:** `facetFunctionSelectors` and registry views return your new selectors
- **Mythril:** High (PR) or Medium+High (main) → fail if not allowlisted
- **SHA256SUMS:** verify

## 8) Commit/apply (governance delay)

```bash
# Commit plan (starts delay window, e.g., 24h)
npx hardhat run scripts/commit-plan.js --network <network>

# After delay elapses
npx hardhat run scripts/apply-plan.js --network <network>
```

Your CI can optionally:

- Sign manifest (EIP-712) after gates pass
- Save `commit-result.json` / `apply-result.json`
- Run post-apply validation (loupe, EXTCODEHASH, a few live calls)

## 9) Post-apply checks (quick)

```bash
npx hardhat test --grep "CustomerFacet"   # or "MyBusinessLogic"
npm run pipeline:observed                 # refresh observed snapshot post-apply
```

## "Gotchas" checklist

- **Storage:** only via `CustomerStorage.layout()`; no state vars in the facet
- **Selectors:** avoid collisions with existing facets
- **Salt:** must be deterministic and match between predictive/observed
- **Size:** stay under EIP-170 limit (24KB)
- **Testing:** include integration tests for all new functions

## One-liner happy path (local)

```bash
npm run new:facet Customer \
&& npm run compile \
&& npx ts-node scripts/manifest/add-facet-routes.ts Customer \
&& npm run pipeline:predictive \
&& npx hardhat run scripts/deploy/deploy-facet.js \
&& npm run pipeline:observed
```

## Why this is safer

- **Deterministic salt + codehash parity** = reproducible deployments
- **Split predictive/observed** = drift detection before commit/apply
- **Loupe & EIP-170 gates** = runtime safety
- **Mythril pre/post** = source + bytecode coverage
- **Manifest signing** = attest the exact state you're shipping

## ✅ Production Features Included

- Diamond storage pattern (collision-safe)
- Access controls (admin/operator roles)
- Pause functionality integration
- Event emissions
- ERC-165 interface support
- Manifest/loupe compatibility
- Production-ready error handling
- CREATE2 deterministic deployment
- Mythril security scanning
- Post-deployment validation
