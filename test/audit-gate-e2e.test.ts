import { expect } from "chai";
import { ethers } from "hardhat";

describe("ManifestDispatcher audit gate e2e", function () {
  it("enforces audit registry on activation and respects dev bypass & try/catch", async function () {
    const [deployer] = await ethers.getSigners();

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
    await md.commitRoot(pending, 1);

    // 1) Set registry and ensure activation reverts when audit invalid (default false)
    await md.setAuditRegistry(ar.target);
    await expect(md.activateCommittedRoot()).to.be.revertedWithCustomError(md, "AuditNotApproved");

    // 2) Make audit valid and activation succeeds
    await ar.setStatus(pending, true);
    await md.commitRoot(pending, 1).catch(() => {}); // ensure pending still set (commitRoot idempotent here)
    // activate should now succeed
    await md.activateCommittedRoot();
    const active = await md.activeRoot();
    expect(active).to.equal(pending);

    // 3) New pending root that causes AuditRegistry to revert; activation should revert
    const pending2 = ethers.keccak256(ethers.toUtf8Bytes("pending-root-2"));
    await md.commitRoot(pending2, 2);
    await ar.setRevert(true);
    await expect(md.activateCommittedRoot()).to.be.revertedWithCustomError(md, "AuditNotApproved");

    // 4) Enable dev bypass and activation should succeed despite revert
    await md.setDevRegistrarEnabled(true);
    await md.activateCommittedRoot();
    const active2 = await md.activeRoot();
    expect(active2).to.equal(pending2);
  });
});
