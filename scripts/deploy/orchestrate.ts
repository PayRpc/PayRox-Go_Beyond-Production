import { ethers } from "hardhat";

async function main() {
  const FACTORY = process.env.FACTORY_ADDRESS || "";
  const DISPATCHER = process.env.DISPATCHER_ADDRESS || "";
  const ROUTER = process.env.ROUTER_ADDRESS || "";
  const CODEHASH = process.env.DISPATCHER_CODEHASH || "0x0000000000000000000000000000000000000000000000000000000000000000";

  console.log("Orchestrator preflight checks:\n");
  console.log("FACTORY_ADDRESS:", FACTORY || "(not set)");
  console.log("DISPATCHER_ADDRESS:", DISPATCHER || "(not set)");
  console.log("ROUTER_ADDRESS:", ROUTER || "(not set)");
  console.log("DISPATCHER_CODEHASH:", CODEHASH);

  if (!FACTORY) console.warn("WARNING: FACTORY_ADDRESS not set. Deterministic deploys will not be possible.");
  if (!DISPATCHER) console.warn("WARNING: DISPATCHER_ADDRESS not set. You must deploy or point to an existing ManifestDispatcher.");

  // If dispatcher exists, print a light read of its codehash if possible
  if (DISPATCHER) {
    try {
      const code = await ethers.provider.getCode(DISPATCHER);
      const hash = ethers.keccak256(code);
      console.log("On-chain EXTCODEHASH(dispatcher):", hash);
      if (CODEHASH && CODEHASH !== "0x0" && CODEHASH !== hash) {
        console.warn("DISPATCHER_CODEHASH mismatch vs on-chain code. Ensure you're pointing at correct dispatcher or update DISPATCHER_CODEHASH.");
      }
    } catch (e) {
      console.warn("Could not fetch dispatcher code:", e);
    }
  }

  console.log("\nNext steps (manual):");
  console.log("1) Deploy ManifestDispatcher (if not present).");
  console.log("2) Deploy DeterministicChunkFactory.");
  console.log("3) Deploy Orchestrator pointing at Dispatch + Factory.");
  console.log("4) Use Orchestrator to deploy facets via factory, compute selector→facet→codehash arrays.");
  console.log("5) Propose/commit/apply plan on dispatcher, then run any InitFacet migrations.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
