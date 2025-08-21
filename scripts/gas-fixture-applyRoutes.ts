// scripts/gas-fixture-applyRoutes.ts
// @ts-nocheck
import hre from "hardhat";
import { encodeLeaf } from "./utils/merkle";

// Lightweight CLI parsing (no external deps)
function parseArg (name) {
  const raw = process.argv.slice(2)
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i]
    if (v === name) return raw[i + 1] || true
    if (v.startsWith(name + '=')) return v.split('=')[1]
  }
  return null
}

function hasFlag (name) {
  const raw = process.argv.slice(2)
  return raw.includes(name) || raw.some((r) => r.startsWith(name + '='))
}

async function main() {
  const { ethers } = hre;
  console.log("⚙️  Compiling and deploying minimal fixtures for gas estimation...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // --- Parse CLI options ---
  const cliActivation = parseArg('--activation-delay') || parseArg('--activationDelay');
  const activationDelaySeconds = cliActivation != null ? Number(cliActivation) : 0; // default 0 for quick activation
  const selectorArg = parseArg('--selector') || parseArg('--sel');
  if (selectorArg) {
    // allow 0x-prefixed short selectors or function signatures
    const s = selectorArg.startsWith('0x') ? selectorArg : (ethers.id(selectorArg).slice(0, 10));
    selectors[0] = s;
  }

  const noReport = hasFlag('--no-report');
  const outPathArg = parseArg('--out') || parseArg('--output');

  // --- Deploy ManifestDispatcher (admin=deployer, activation delay configurable) ---
  const DispatcherFactory = await ethers.getContractFactory("ManifestDispatcher");
  const dispatcher = await DispatcherFactory.deploy(deployer.address, activationDelaySeconds);
  await dispatcher.waitForDeployment();
  const dispatcherAddr = await dispatcher.getAddress();
  console.log("Dispatcher deployed at", dispatcherAddr);

  // --- Prepare a facet (prefer a real facet; otherwise we still proceed for gas estimation) ---
  const selectors: string[] = ["0x00000000"]; // a single selector; can be any bytes4 for the fixture

  let facetAddress: string | undefined;
  try {
    // Try to deploy (optional) library to satisfy linking if ExampleFacetA uses it.
    // If the lib doesn't exist / not needed, we continue silently.
    let libraries: Record<string, string> | undefined;
    try {
      const GasLibFactory = await ethers.getContractFactory("GasOptimizationUtils");
      const gasLib = await GasLibFactory.deploy();
      await gasLib.waitForDeployment();
      const gasLibAddr = await gasLib.getAddress();
      console.log("Deployed GasOptimizationUtils at", gasLibAddr);

      // Fully-qualified name avoids ambiguity across multiple files
      libraries = { "contracts/utils/GasOptimizationUtils.sol:GasOptimizationUtils": gasLibAddr };
    } catch (linkErr) {
      console.warn("ℹ️  GasOptimizationUtils deploy/link skipped:", (linkErr as any)?.message || linkErr);
    }

    let FacetFactory;
    try {
      // Prefer to get the factory without libraries. Passing unused libraries can cause errors.
      FacetFactory = await ethers.getContractFactory("ExampleFacetA");
    } catch (getErr) {
      // If initial attempt failed and we have libraries, retry with libraries
      if (libraries) {
        FacetFactory = await ethers.getContractFactory("ExampleFacetA", { libraries });
      } else {
        throw getErr;
      }
    }

    const facet = await FacetFactory.deploy();
    await facet.waitForDeployment();
    facetAddress = await facet.getAddress();
    console.log("Deployed ExampleFacetA at", facetAddress);
  } catch (err) {
    console.warn(
      "⚠️  ExampleFacetA not found or failed to deploy; continuing with fixture anyway:",
      (err as any)?.message || err
    );
    // Fallback to a non-zero address to complete the leaf/root math (gas estimate still works).
    // If it's an EOA, EXTCODEHASH will be zero on-chain, but our proof + root are self-consistent
    // for the purpose of estimating applyRoutes gas.
    facetAddress = deployer.address;
  }

  // --- Compute codehash = keccak256(runtime code). This equals EXTCODEHASH for real contracts. ---
  let facetCodehash = ethers.ZeroHash;
  try {
    const code = await ethers.provider.getCode(facetAddress);
    // For EOAs/empty code, getCode() === '0x' and keccak256('0x') is fine for the *fixture root* we commit.
    facetCodehash = ethers.keccak256(code);
  } catch (err) {
    console.warn("ℹ️  Failed to fetch code for facet; using ZeroHash:", (err as any)?.message || err);
  }

  const facets: string[] = [facetAddress];
  const codehashes: string[] = [facetCodehash];

  // --- Proofs: single-leaf ordered Merkle => empty proof & positions. Using legacy (bool[][]) path here. ---
  const proofs: string[][] = [[]];
  const isRight: boolean[][] = [[]];

  // --- Compute leaf exactly like OrderedMerkle.leafOfSelectorRoute (keccak256(abi.encode(selector, facet, codehash))) ---
  // Use ABI coder to produce the same encoding as Solidity's abi.encode
  const abiCoder = new (ethers as any).AbiCoder();
  const leaf = ethers.keccak256(abiCoder.encode(["bytes4", "address", "bytes32"], [selectors[0], facets[0], codehashes[0]]));

  // Build root = _hashLeaf(leaf) = keccak256(abi.encodePacked(bytes1(0x00), leaf))
  const root = ethers.keccak256(ethers.concat(["0x00", leaf]));

  // --- Commit pending root at next epoch ---
  try {
    const currentEpoch: bigint = await dispatcher.activeEpoch();
    const nextEpoch = currentEpoch + 1n;
    const tx = await dispatcher.commitRoot(root, nextEpoch);
    const rc = await tx.wait();
    console.log(`Committed root ${root} at epoch ${nextEpoch} (tx: ${rc?.hash ?? rc?.transactionHash})`);
  } catch (err) {
    console.error("❌ commitRoot failed:", (err as any)?.message || err);
    // We still attempt gas estimation; if commitRoot failed due to role, estimation will revert as expected.
  }

  // --- Estimate gas for applyRoutes (proofs verified against the pending root) ---
  let gas = null;
  let gasActivate = null;
  try {
    // Preferred: direct estimateGas helper if available
    if (dispatcher.estimateGas && dispatcher.estimateGas.applyRoutes) {
      gas = await dispatcher.estimateGas.applyRoutes(
        selectors,
        facets,
        codehashes,
        proofs,
        isRight
      );
    } else {
      // Fallback: encode function data via the contract interface and estimate via provider
      const data = dispatcher.interface.encodeFunctionData("applyRoutes", [
        selectors,
        facets,
        codehashes,
        proofs,
        isRight,
      ]);
      gas = await ethers.provider.estimateGas({ to: dispatcherAddr, data });
    }
    console.log(`⛽ estimateGas(applyRoutes) => ${gas.toString()}`);
  } catch (err) {
    console.error("❌ estimateGas(applyRoutes) failed:", (err as any)?.message || err);
  }

  // --- (Optional) Estimate activateCommittedRoot after any delay ---
  try {
    if (dispatcher.estimateGas && dispatcher.estimateGas.activateCommittedRoot) {
      gasActivate = await dispatcher.estimateGas.activateCommittedRoot();
    } else {
      const data = dispatcher.interface.encodeFunctionData("activateCommittedRoot", []);
      gasActivate = await ethers.provider.estimateGas({ to: dispatcherAddr, data });
    }
    console.log(`⛽ estimateGas(activateCommittedRoot) => ${gasActivate.toString()}`);
  } catch (err) {
    console.warn("ℹ️  estimateGas(activateCommittedRoot) skipped/failed:", (err as any)?.message || err);
  }

  // --- Write JSON report (unless disabled) ---
  if (!noReport) {
    try {
      const fs = require('fs');
      const path = require('path');
      const network = hre.network.name || 'unknown';
      const ts = Date.now();
      const defaultOutDir = path.resolve(process.cwd(), 'reports', 'monitoring');
      if (!fs.existsSync(defaultOutDir)) fs.mkdirSync(defaultOutDir, { recursive: true });

      let outPath;
      if (outPathArg) {
        const candidate = path.resolve(process.cwd(), outPathArg);
        // if candidate looks like a directory (no .json) use default filename inside it
        if (candidate.endsWith('.json')) {
          outPath = candidate;
        } else {
          // ensure directory exists
          if (!fs.existsSync(candidate)) fs.mkdirSync(candidate, { recursive: true });
          outPath = path.join(candidate, `gas_estimate-${network}-${ts}.json`);
        }
      } else {
        outPath = path.join(defaultOutDir, `gas_estimate-${network}-${ts}.json`);
      }

      const rawEpoch = await dispatcher.activeEpoch();
      const report = {
        ts,
        network,
        deployer: deployer.address,
        dispatcher: dispatcherAddr,
        facet: facetAddress,
        root,
        epoch: rawEpoch != null ? rawEpoch.toString() : null,
        activationDelaySeconds,
        estimates: {
          applyRoutes: gas != null ? gas.toString() : null,
          activateCommittedRoot: gasActivate != null ? gasActivate.toString() : null
        }
      };
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      console.log('Saved gas report to', outPath);
    } catch (err) {
      console.warn('Failed to write gas report JSON:', (err as any)?.message || err);
    }
  } else {
    console.log('Skipping JSON report ( --no-report )');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
