import { expect } from "chai";
import { ethers as hardhatEthers } from "hardhat";
import { ethers } from "ethers";

describe("DeterministicChunkFactory - deploy/idempotency", function () {
  it("deploys via CREATE2 and is idempotent when called again with same inputs", async function () {
    const Factory: any = await hardhatEthers.getContractFactory("contracts/factory/DeterministicChunkFactory.sol:DeterministicChunkFactory");
    const factory: any = await Factory.deploy();
    await factory.waitForDeployment();

    const Facet: any = await hardhatEthers.getContractFactory("SimpleFacet");
    const bytecode = Facet.bytecode; // creation bytecode hex

    const salt = ethers.id("test-salt-1");
    const bytecodeHash = ethers.keccak256(bytecode);

    const computed = await factory.computeAddress(salt, bytecodeHash);

    // First deploy: skip runtime verification by passing zero
    const firstDeployTx = await factory.deploy(salt, bytecode, ethers.ZeroHash);
    await firstDeployTx.wait?.();

    const runtimeCode = await hardhatEthers.provider.getCode(computed);
    expect(runtimeCode).to.not.equal("0x");

    const runtimeHash = ethers.keccak256(runtimeCode);

    // Second deploy with same salt/bytecode but specifying runtime hash should return same address and not revert
    // Use callStatic to get the return value without sending a transaction
    const againAddr = await factory.deploy.staticCall(salt, bytecode, runtimeHash);
    // ensure address equals computed
    expect(againAddr).to.equal(computed);
  });
});
