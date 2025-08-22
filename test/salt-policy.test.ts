import { expect } from "chai";
import { ethers } from "hardhat";

describe("SaltViewFacet", () => {
  it("matches ethers.getCreate2Address", async () => {
    const _Fac = await ethers.getContractFactory("SaltViewFacet");
    const _f = await Fac.deploy();
    await f.waitForDeployment();

    const _deployer = "0x4e59b44847b379578588920cA78FbF26c0B4956C"; // EIP-2470
    const _version = "1.0.0";
    const _content = "PayRoxUniversalContract";
    const _nonce = 1000n;

    if (!f) throw new Error('contract not deployed')
    const _factorySalt = await (f as any).factorySalt(version);
    const universalSalt = await (f as any).universalSalt(
      deployer,
      content,
      nonce,
      version,
    );

    // Fake bytecode for test
    const _factoryBytecode = "0x60006000fd";
    const _targetBytecode = "0x60016000fd";

  const _hFac = await (f as any).hashInitCode(factoryBytecode);
  const _hTgt = await (f as any).hashInitCode(targetBytecode);

    const predictedFactory = await (f as any).predictCreate2(
      deployer,
      factorySalt,
      hFac,
    );
    const predictedFactoryRef = ethers.getCreate2Address(
      deployer,
      factorySalt,
      hFac,
    );
    expect(predictedFactory).to.equal(predictedFactoryRef);

    const predictedTarget = await (f as any).predictCreate2(
      predictedFactory,
      universalSalt,
      hTgt,
    );
    const predictedTargetRef = ethers.getCreate2Address(
      predictedFactory,
      universalSalt,
      hTgt,
    );
    expect(predictedTarget).to.equal(predictedTargetRef);
  });
});
