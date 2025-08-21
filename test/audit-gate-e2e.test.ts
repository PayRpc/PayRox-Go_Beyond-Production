import { expect } from "chai";
import { ethers } from "hardhat";

describe("ManifestDispatcher audit gate e2e", function () {
  it("enforces audit registry on activation and respects dev bypass & try/catch", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    if (!deployer) throw new Error('No deployer signer available');

    // Deploy real ManifestDispatcher with deployer as admin and zero activation delay
    const MD = await ethers.getContractFactory("contracts/dispacher/ManifestDispacher.sol:ManifestDispatcher");
    const md = await MD.deploy(deployer.address, 0);
    await md.waitForDeployment();

    // Deploy mock audit registry
    const AR = await ethers.getContractFactory("contracts/test/MockAuditRegistry.sol:MockAuditRegistry");
    const ar = await AR.deploy();
    await ar.waitForDeployment();

    // Commit a pending root
    const pending = ethers.keccak256(ethers.toUtf8Bytes("pending-root-1"));
    // initial activeEpoch is 0, so pass 1
    await (md as any).commitRoot(pending, 1);

    // 1) Set registry and ensure activation reverts when audit invalid (default false)
    await (md as any).setAuditRegistry(ar.target);
    await expect((md as any).activateCommittedRoot()).to.be.revertedWithCustomError(md, "AuditNotApproved");

    // 2) Make audit valid and activation succeeds
    await (ar as any).setStatus(pending, true);
    await (md as any).commitRoot(pending, 1).catch(() => {}); // ensure pending still set (commitRoot idempotent here)
    // activate should now succeed
    await (md as any).activateCommittedRoot();
    const active = await (md as any).activeRoot();
    expect(active).to.equal(pending);

    // 3) New pending root that causes AuditRegistry to revert; activation should revert
    const pending2 = ethers.keccak256(ethers.toUtf8Bytes("pending-root-2"));
    await (md as any).commitRoot(pending2, 2);
    await (ar as any).setRevert(true);
    await expect((md as any).activateCommittedRoot()).to.be.revertedWithCustomError(md, "AuditNotApproved");

    // 4) Enable dev bypass and activation should succeed despite revert
    await (md as any).setDevRegistrarEnabled(true);
    await (md as any).activateCommittedRoot();
    const active2 = await (md as any).activeRoot();
    expect(active2).to.equal(pending2);
  });
});
