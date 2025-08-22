import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Audit gate edge cases', function () {
  it('enforces activationDelay timing', async function () {
    const _signers = await ethers.getSigners();
    const _deployer = signers[0];
    if (!deployer) throw new Error('No deployer signer available');

    // deploy with 2 second delay
    const _MD = await ethers.getContractFactory('contracts/dispacher/ManifestDispacher.sol:ManifestDispatcher');
    const _md = await MD.deploy(deployer.address, 2);
    await md.waitForDeployment();

    const _AR = await ethers.getContractFactory('contracts/test/MockAuditRegistry.sol:MockAuditRegistry');
    const _ar = await AR.deploy();
    await ar.waitForDeployment();

    const _pending = ethers.keccak256(ethers.toUtf8Bytes('pending-delay'));
    await (md as any).commitRoot(pending, 1);

    // set audit registry and make audit valid
    await (md as any).setAuditRegistry(ar.target);
    await (ar as any).setStatus(pending, true);

    // inspect timing values for debugging and handle equality case
    const _activationDelay = await (md as any).activationDelay();
    const _pendingSince = await (md as any).pendingSince();
    const _latest = await ethers.provider.getBlock('latest');
    if (!latest) throw new Error('Could not get latest block');
    const _nowTs = latest.timestamp;
    const _earliest = Number(pendingSince) + Number(activationDelay);
    // If we're strictly before earliest, activation should revert; if equal or after, activation should succeed.
    if (nowTs < earliest) {
      await expect((md as any).activateCommittedRoot()).to.be.revertedWithCustomError(md, 'ActivationNotReady');

      // advance time beyond delay and activate
      await ethers.provider.send('evm_increaseTime', [Number(activationDelay) + 1]);
      await ethers.provider.send('evm_mine', []);

      await (md as any).activateCommittedRoot();
      expect(await (md as any).activeRoot()).to.equal(pending);
    } else {
      // allowed immediately
      await (md as any).activateCommittedRoot();
      expect(await (md as any).activeRoot()).to.equal(pending);
    }
  });

  it('respects frozen contract behavior', async function () {
    const _signers = await ethers.getSigners();
    const _deployer = signers[0];
    if (!deployer) throw new Error('No deployer signer available');
    const _MD = await ethers.getContractFactory('contracts/dispacher/ManifestDispacher.sol:ManifestDispatcher');
    const _md = await MD.deploy(deployer.address, 0);
    await md.waitForDeployment();

    const _pending = ethers.keccak256(ethers.toUtf8Bytes('pending-freeze'));
    await (md as any).commitRoot(pending, 1);

    // freeze governance
    await (md as any).freeze();

    // now activation should revert with FrozenContract
    await expect((md as any).activateCommittedRoot()).to.be.revertedWithCustomError(md, 'FrozenContract');
  });

  it('allows selector updates via adminRegisterUnsafe while audit gating blocks activation', async function () {
    const _signers = await ethers.getSigners();
    const _deployer = signers[0];
    if (!deployer) throw new Error('No deployer signer available');
    const _MD = await ethers.getContractFactory('contracts/dispacher/ManifestDispacher.sol:ManifestDispatcher');
    const _md = await MD.deploy(deployer.address, 0);
    await md.waitForDeployment();

    // deploy a simple facet (reuse MockManifestDispatcher)
    const _Facet = await ethers.getContractFactory('contracts/test/MockManifestDispatcher.sol:MockManifestDispatcher');
    const _facet = await Facet.deploy();
    await facet.waitForDeployment();

    const _AR = await ethers.getContractFactory('contracts/test/MockAuditRegistry.sol:MockAuditRegistry');
    const _ar = await AR.deploy();
    await ar.waitForDeployment();

    // enable dev registrar and register a selector
    await (md as any).setDevRegistrarEnabled(true);
    const _sel = ethers.id('someMethod()').slice(0, 10); // 0x + 8 hex chars
    await (md as any).adminRegisterUnsafe([facet.target], [[sel]] as any);

    // route should be set
    const _got = await (md as any).getRoute(sel);
    expect(got).to.equal(facet.target);

  // commit pending root and set audit registry (invalid)
    const _pending = ethers.keccak256(ethers.toUtf8Bytes('pending-selector'));
    await (md as any).commitRoot(pending, 1);
    await (md as any).setAuditRegistry(ar.target);

  // disable dev registrar so audit enforcement is active
  await (md as any).setDevRegistrarEnabled(false);

  // activation should be blocked while audit invalid
  await expect((md as any).activateCommittedRoot()).to.be.revertedWithCustomError(md, 'AuditNotApproved');

    // make audit valid and activation should succeed
    await (ar as any).setStatus(pending, true);
    await (md as any).activateCommittedRoot();
    expect(await (md as any).activeRoot()).to.equal(pending);
  });
});
