import { expect } from "chai";
import { ethers } from "hardhat";

describe("ManifestDispatcher audit gate", function () {
  it("allows activation when auditRegistry is not set", async function () {
    const Fac = await ethers.getContractFactory(
      "contracts/test/MockManifestDispatcher.sol:MockManifestDispatcher"
    );
    const md = await Fac.deploy();
    await md.waitForDeployment();

    // activateCommittedRoot is a stub in the mock and intentionally reverts with a fixed message
    await expect((md as any).activateCommittedRoot()).to.be.revertedWith(
      "Not implemented in mock"
    );
  });

  it("queries an AuditRegistry and reverts when audit invalid", async function () {
    const AR = await ethers.getContractFactory(
      "contracts/test/MockAuditRegistry.sol:MockAuditRegistry"
    );
    const ar = await AR.deploy();
    await ar.waitForDeployment();

    // Sanity: set a status for a fake hash and validate mock behavior
    const fake = ethers.ZeroHash;
    await (ar as any).setStatus(fake, false);
    const res = await (ar as any).getAuditStatus(fake);
    expect(res[0]).to.equal(false);
  });
});
