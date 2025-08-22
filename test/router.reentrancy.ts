import { expect } from "chai";
import { ethers } from "hardhat";

describe("PayRoxProxyRouter locks", () => {
  it("releases fallback lock between calls", async () => {
    const [deployer] = await ethers.getSigners();

  // Mock dispatcher with two trivial functions (compiled from contracts/test/MockDispatcher.sol)
  const Facet = await ethers.getContractFactory("MockDispatcher");
  const dispatcher = await Facet.deploy(); await dispatcher.waitForDeployment();

  const Router = await ethers.getContractFactory("contracts/Proxy/PayRoxProxyRouter.sol:PayRoxProxyRouter");
    const router = await Router.deploy(); await router.waitForDeployment();

    // init (strictCodehash=false to ignore pinning for this test)
    await router.initializeProxyRouter(
  await deployer.getAddress(),
  await dispatcher.getAddress(),
  "0x0000000000000000000000000000000000000000000000000000000000000000", false,
      ethers.keccak256(ethers.toUtf8Bytes("payrox.router.init.2024.production"))
    );

    // Call a(), then b() via fallback (craft calldata)
    const selA = ethers.id("a()").slice(0,10);
    const selB = ethers.id("b()").slice(0,10);

    const r1 = await ethers.provider.call({ to: await router.getAddress(), data: selA });
    expect(ethers.toNumber(r1)).to.equal(1);

    const r2 = await ethers.provider.call({ to: await router.getAddress(), data: selB });
    expect(ethers.toNumber(r2)).to.equal(2);
  }).timeout(20000);
});
