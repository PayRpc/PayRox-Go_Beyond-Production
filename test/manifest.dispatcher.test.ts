import { expect } from "chai";
import { ethers as hardhatEthers } from "hardhat";
import { ethers } from "ethers"; // utils helpers

describe("ManifestDispatcher - commit/apply lifecycle", function () {
  it("enforces activation delay and activates root after delay", async function () {
  const signers = await hardhatEthers.getSigners();
  const owner = signers[0];
  const Factory: any = await hardhatEthers.getContractFactory("contracts/manifest/ManifestDispatcher.sol:ManifestDispatcher");
  const dispatcher: any = await Factory.deploy();
  await dispatcher.waitForDeployment();
  await dispatcher.initialize(owner.address);

    // set activation delay to 100 seconds for a clear test
    await dispatcher.setActivationDelay(100);

  const root = ethers.hexlify(ethers.randomBytes(32));
    const epoch = 1;
    await dispatcher.commitRoot(root, epoch);

    // Check that we have a pending root
    expect(await dispatcher.pendingRoot()).to.equal(root);

    // activating immediately should revert due to delay
    await expect(dispatcher.activateCommittedRoot()).to.be.revertedWithCustomError(dispatcher, "ActivationDelayNotElapsed");

    // fast-forward by 101 seconds via evm_increaseTime
    await hardhatEthers.provider.send("evm_increaseTime", [101]);
    await hardhatEthers.provider.send("evm_mine", []);

    await expect(dispatcher.activateCommittedRoot()).to.emit(dispatcher, "RootActivated");
    expect(await dispatcher.activeRoot()).to.equal(root);
  });

  it("applies routes and enforces codehash when provided", async function () {
  const signers = await hardhatEthers.getSigners();
  const owner = signers[0];
  const Factory: any = await hardhatEthers.getContractFactory("contracts/manifest/ManifestDispatcher.sol:ManifestDispatcher");
  const dispatcher: any = await Factory.deploy();
  await dispatcher.waitForDeployment();
  await dispatcher.initialize(owner.address);

  const Facet: any = await hardhatEthers.getContractFactory("SimpleFacet");
  const facet: any = await Facet.deploy();
  await facet.waitForDeployment();

  const selector = "0x" + ethers.id("ping()").slice(2, 10);
  const code = await hardhatEthers.provider.getCode(await facet.getAddress());
  const codehash = ethers.keccak256(code);
    // apply with non-zero codehash should succeed if it matches
    await dispatcher.applyRoutes([selector], [await facet.getAddress()], [codehash], [], []);

    const route = await dispatcher.routes(selector);
    expect(route[0]).to.equal(await facet.getAddress());
  });

  it("respects pause state and blocks configuration changes", async function () {
    const signers = await hardhatEthers.getSigners();
    const owner = signers[0];
    const Factory: any = await hardhatEthers.getContractFactory("contracts/manifest/ManifestDispatcher.sol:ManifestDispatcher");
    const dispatcher: any = await Factory.deploy();
    await dispatcher.waitForDeployment();
    await dispatcher.initialize(owner.address);

    // pause the dispatcher
    await dispatcher.setPaused(true);

    const root = ethers.hexlify(ethers.randomBytes(32));
    const selector = "0x12345678";

    // applying routes should revert when paused
    await expect(dispatcher.applyRoutes([selector], [ethers.ZeroAddress], [ethers.ZeroHash], [], []))
      .to.be.revertedWithCustomError(dispatcher, "Paused");

    // removing routes should revert when paused
    await expect(dispatcher.removeRoutes([selector]))
      .to.be.revertedWithCustomError(dispatcher, "Paused");

    // unpause and verify operations work
    await dispatcher.setPaused(false);
    await dispatcher.applyRoutes([selector], [ethers.ZeroAddress], [ethers.ZeroHash], [], []);
  });

  it("respects freeze state and blocks all configuration", async function () {
    const signers = await hardhatEthers.getSigners();
    const owner = signers[0];
    const Factory: any = await hardhatEthers.getContractFactory("contracts/manifest/ManifestDispatcher.sol:ManifestDispatcher");
    const dispatcher: any = await Factory.deploy();
    await dispatcher.waitForDeployment();
    await dispatcher.initialize(owner.address);

    // freeze the dispatcher (irreversible)
    await expect(dispatcher.freeze()).to.emit(dispatcher, "Frozen");
    expect(await dispatcher.frozen()).to.be.true;

    const root = ethers.hexlify(ethers.randomBytes(32));
    const selector = "0x12345678";

    // all configuration operations should revert when frozen
    await expect(dispatcher.commitRoot(root, 1))
      .to.be.revertedWithCustomError(dispatcher, "FrozenState");

    await expect(dispatcher.activateCommittedRoot())
      .to.be.revertedWithCustomError(dispatcher, "FrozenState");

    await expect(dispatcher.applyRoutes([selector], [ethers.ZeroAddress], [ethers.ZeroHash], [], []))
      .to.be.revertedWithCustomError(dispatcher, "FrozenState");

    await expect(dispatcher.setActivationDelay(300))
      .to.be.revertedWithCustomError(dispatcher, "FrozenState");
  });
});
