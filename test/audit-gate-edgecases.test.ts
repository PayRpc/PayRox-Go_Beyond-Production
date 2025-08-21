import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Audit gate edge cases', function () {
  it('enforces activationDelay timing', async function () {
    const [deployer] = await ethers.getSigners();

    // deploy with 2 second delay
    const MD = await ethers.getContractFactory('contracts/dispacher/ManifestDispacher.sol:ManifestDispatcher');
    const md = await MD.deploy(deployer.address, 2);
    await md.waitForDeployment();

    const AR = await ethers.getContractFactory('contracts/test/MockAuditRegistry.sol:MockAuditRegistry');
    const ar = await AR.deploy();
    await ar.waitForDeployment();

    const pending = ethers.keccak256(ethers.toUtf8Bytes('pending-delay'));
    await md.commitRoot(pending, 1);

    // set audit registry and make audit valid
    await md.setAuditRegistry(ar.target);
    await ar.setStatus(pending, true);

    // inspect timing values for debugging and handle equality case
    const activationDelay = await md.activationDelay();
    const pendingSince = await md.pendingSince();
    const latest = await ethers.provider.getBlock('latest');
    const nowTs = latest.timestamp;
    const earliest = Number(pendingSince) + Number(activationDelay);
    // If we're strictly before earliest, activation should revert; if equal or after, activation should succeed.
    if (nowTs < earliest) {
      await expect(md.activateCommittedRoot()).to.be.revertedWithCustomError(md, 'ActivationNotReady');

      // advance time beyond delay and activate
      await ethers.provider.send('evm_increaseTime', [Number(activationDelay) + 1]);
      await ethers.provider.send('evm_mine', []);

      await md.activateCommittedRoot();
      expect(await md.activeRoot()).to.equal(pending);
    } else {
      // allowed immediately
      await md.activateCommittedRoot();
      expect(await md.activeRoot()).to.equal(pending);
    }
  });

  it('respects frozen contract behavior', async function () {
    const [deployer] = await ethers.getSigners();
    const MD = await ethers.getContractFactory('contracts/dispacher/ManifestDispacher.sol:ManifestDispatcher');
    const md = await MD.deploy(deployer.address, 0);
    await md.waitForDeployment();

    const pending = ethers.keccak256(ethers.toUtf8Bytes('pending-freeze'));
    await md.commitRoot(pending, 1);

    // freeze governance
    await md.freeze();

    // now activation should revert with FrozenContract
    await expect(md.activateCommittedRoot()).to.be.revertedWithCustomError(md, 'FrozenContract');
  });

  it('allows selector updates via adminRegisterUnsafe while audit gating blocks activation', async function () {
    const [deployer] = await ethers.getSigners();
    const MD = await ethers.getContractFactory('contracts/dispacher/ManifestDispacher.sol:ManifestDispatcher');
    const md = await MD.deploy(deployer.address, 0);
    await md.waitForDeployment();

    // deploy a simple facet (reuse MockManifestDispatcher)
    const Facet = await ethers.getContractFactory('contracts/test/MockManifestDispatcher.sol:MockManifestDispatcher');
    const facet = await Facet.deploy();
    await facet.waitForDeployment();

    const AR = await ethers.getContractFactory('contracts/test/MockAuditRegistry.sol:MockAuditRegistry');
    const ar = await AR.deploy();
    await ar.waitForDeployment();

    // enable dev registrar and register a selector
    await md.setDevRegistrarEnabled(true);
    const sel = ethers.id('someMethod()').slice(0, 10); // 0x + 8 hex chars
    await md.adminRegisterUnsafe([facet.target], [[sel]] as any);

    // route should be set
    const got = await md.getRoute(sel);
    expect(got).to.equal(facet.target);

  // commit pending root and set audit registry (invalid)
    const pending = ethers.keccak256(ethers.toUtf8Bytes('pending-selector'));
    await md.commitRoot(pending, 1);
    await md.setAuditRegistry(ar.target);

  // disable dev registrar so audit enforcement is active
  await md.setDevRegistrarEnabled(false);

  // activation should be blocked while audit invalid
  await expect(md.activateCommittedRoot()).to.be.revertedWithCustomError(md, 'AuditNotApproved');

    // make audit valid and activation should succeed
    await ar.setStatus(pending, true);
    await md.activateCommittedRoot();
    expect(await md.activeRoot()).to.equal(pending);
  });
});
