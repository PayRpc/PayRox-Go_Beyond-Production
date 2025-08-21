# PayRox Developer Tool Plugins

Make "plugins" for the tooling layer, not the on-chain layer.

Package PayRox workflows (split → manifest → commit/apply/activate, factory staging, integrity checks) as developer-tool plugins (Hardhat/Foundry/GitHub Action/CLI).

Don't invent an on-chain "plugin" mechanism beyond your Diamond/Manifest model—runtime-pluggable modules increase attack surface. Keep on-chain extensibility strictly through facets + manifest + codehash gating.

## What to Pluginize (High ROI)

### Build/Release
- `split-facet` + `postprocess` → emits facets
- `payrox:manifest:build|commit|apply|activate` tasks (talk to IManifestDispatcher)
- Selector parity & EIP-170/3860 guards

### Factory Ops
- `payrox:factory:stage|deploy|batch` (wrap IChunkFactory), with system-integrity checks (expected hashes, dispatcher codehash)

### Safety & CI
- "Fail CI if": dispatcher frozen when it shouldn't be, codehash mismatch, routes missing, OrderedMerkle proofs invalid, or regressed selectors/events

## Targets Recommended

1. **Hardhat plugin** (fastest adoption in your repo)
2. **Foundry library + forge script** (for teams on forge)
3. **GitHub Action** (runs the same tasks in CI)
4. **Optional**: VS Code command palette wrapper for one-click split/manifest

## Minimal Hardhat Plugin Shape (Sketch)

```typescript
// plugins/hardhat-payrox/src/index.ts
import { task } from "hardhat/config";
import { ethers } from "ethers";
import OrderedMerkle from "./orderedMerkle"; // local helper

task("payrox:manifest:apply", "Apply routes with proof")
  .addParam("dispatcher")
  .addParam("selectorsFile")   // JSON array
  .addParam("facetsFile")      // JSON array
  .addParam("hashesFile")      // JSON array
  .addParam("proofsFile")      // JSON array of arrays
  .addParam("posFile")         // JSON array of bitfields
  .setAction(async (_, hre) => {
    const files = (p: string) => JSON.parse(await hre.artifacts.readArtifactContent(p));
    const dispatcher = await hre.ethers.getContractAt("IManifestDispatcher", _.dispatcher);
    // (Optional) verify proofs locally
    // await OrderedMerkle.verifyBatch(...);
    const tx = await dispatcher.applyRoutes(
      await files(_.selectorsFile),
      await files(_.facetsFile),
      await files(_.hashesFile),
      await files(_.proofsFile),
      await files(_.posFile)
    );
    console.log("applyRoutes tx:", tx.hash);
  });

task("payrox:factory:stage", "Stage a chunk via DeterministicChunkFactory")
  .addParam("factory")
  .addParam("hexdata")
  .setAction(async (args, hre) => {
    const f = await hre.ethers.getContractAt("IChunkFactory", args.factory);
    const tx = await f.stage(args.hexdata, { value: 0 });
    console.log("stage tx:", tx.hash);
  });
```

## Guardrails (Why This Is Safe)

- **On-chain remains governed by manifest + codehash pinning + freeze/pause**—no runtime plugin loading
- **Off-chain plugins are just orchestrators**; they:
  - Pin versions (npm + lockfile)
  - Avoid private keys (use signer from Hardhat/Foundry)
  - Verify OrderedMerkle proofs and selector parity locally before sending txs
  - Assert dispatcher/factory integrity before any call

## Quick Checklist Before You Build

- [ ] **Stable interfaces to expose**: IManifestDispatcher, IManifestDispatcherView, IChunkFactory
- [ ] **Version gates**: enforce expected solidity/OZ versions at plugin runtime (warn on mismatch)
- [ ] **Config defaults per-chain** (L2 gas, maxPriorityFeePerGas, etc.)
- [ ] **Rollback switch**: env var to use old splitter or skip apply (useful during incidents)

## Outcome

You'll keep the security posture on-chain unchanged, while giving teams a clean, repeatable way to refactor, split, build manifests, and deploy facets. Start with the Hardhat plugin, mirror into a Foundry script later, and add a GitHub Action that runs the same tasks in CI.

## Implementation Priority

1. **Phase 1**: Hardhat plugin with core tasks
2. **Phase 2**: Foundry scripts + library
3. **Phase 3**: GitHub Action integration
4. **Phase 4**: VS Code extension (optional)

---

*Reference document for PayRox developer tooling plugin development*
