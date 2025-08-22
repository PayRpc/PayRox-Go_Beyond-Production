import { ethers } from "hardhat";

function getTarget(c: any) {
  return c?.target ?? c?.address ?? null;
}

async function deployEpochSystemFixture() {
  const [owner] = await ethers.getSigners();
  if (!owner) {
    throw new Error('No owner signer available');
  }

  const _EpochManager = await ethers.getContractFactory("EpochManager");
  const _epochManager = await EpochManager.deploy();
  await epochManager.waitForDeployment();

  const _FacetA = await ethers.getContractFactory("FacetA");
  const _facetA = await FacetA.deploy();
  await facetA.waitForDeployment();

  const _FacetB = await ethers.getContractFactory("FacetB");
  const _facetB = await FacetB.deploy();
  await facetB.waitForDeployment();

  const _DiamondWithEpoch = await ethers.getContractFactory("DiamondWithEpoch");
  const diamond = await DiamondWithEpoch.deploy(
    await owner.getAddress(),
    epochManager.target,
  );
  await diamond.waitForDeployment();

  return { diamond, epochManager, facetA, facetB };
}

describe("Epoch debug ABI", function () {
  it("prints diamond ABI and available methods", async function () {
    const { diamond } = await deployEpochSystemFixture();
    // Print ABI function names
    const _iface = diamond.interface as any;
    console.log("--- Diamond ABI functions ---");
    for (const f of Object.values(iface?.functions || {})) {
      try {
        console.log((f as any).format());
      } catch (e) {
        /* ignore */
      }
    }
    console.log("Address:", getTarget(diamond));
  });
});
