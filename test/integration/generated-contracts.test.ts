import { expect } from "chai";
import { ethers } from "hardhat";

describe("Generated Test Contracts", function () {
  it("should deploy and test PayRoxSmallTest", async function () {
    const [deployer] = await ethers.getSigners();

    // Deploy the small test contract
    const SmallTestFactory = await ethers.getContractFactory("PayRoxSmallTest");
    const smallTest = await SmallTestFactory.deploy();
    await smallTest.waitForDeployment();

    console.log(`✅ PayRoxSmallTest deployed to: ${await smallTest.getAddress()}`);

    // Test basic functionality
    const owner = await smallTest.owner();
    expect(owner).to.equal(deployer.address);

    // Test a pure function
    const result = await smallTest.pure0001(42);
    expect(result.result).to.be.gt(0);

    console.log("✅ PayRoxSmallTest functionality verified");
  });

  it("should deploy and test PayRoxMediumTest", async function () {
    const [deployer] = await ethers.getSigners();

    // Deploy the medium test contract
    const MediumTestFactory = await ethers.getContractFactory("PayRoxMediumTest");
    const mediumTest = await MediumTestFactory.deploy();
    await mediumTest.waitForDeployment();

    console.log(`✅ PayRoxMediumTest deployed to: ${await mediumTest.getAddress()}`);

    // Test basic functionality
    const owner = await mediumTest.owner();
    expect(owner).to.equal(deployer.address);

    // Test multiple function types
    const pureResult = await mediumTest.pure0001(42);
    expect(pureResult.result).to.be.gt(0);

    // Test payable function
    const value = ethers.parseEther("0.1");
    const tx = await mediumTest.pay0002({ value });
    await tx.wait();

    const balance = await mediumTest.balanceOf(deployer.address);
    expect(balance).to.be.gt(0);

    console.log("✅ PayRoxMediumTest functionality verified");
  });

  it("should analyze function distribution across all test contracts", async function () {
    const contracts = [
      { name: "PayRoxSmallTest", expectedFunctions: 50 },
      { name: "PayRoxMediumTest", expectedFunctions: 150 },
      { name: "PayRoxTestContract", expectedFunctions: 200 }
    ];

    for (const contractInfo of contracts) {
      const factory = await ethers.getContractFactory(contractInfo.name);
      const abi = factory.interface;

      let functionCount = 0;
      const functionTypes = { pure: 0, view: 0, payable: 0, nonpayable: 0 };

      abi.forEachFunction((func) => {
        functionCount++;
        if (func.stateMutability === "pure") functionTypes.pure++;
        else if (func.stateMutability === "view") functionTypes.view++;
        else if (func.stateMutability === "payable") functionTypes.payable++;
        else functionTypes.nonpayable++;
      });

      console.log(`📊 ${contractInfo.name}:`);
      console.log(`   Functions: ${functionCount} (expected: ${contractInfo.expectedFunctions})`);
      console.log(`   Distribution:`, functionTypes);

      // Verify we have expected number of functions (approximately)
      expect(functionCount).to.be.gte(contractInfo.expectedFunctions * 0.8); // Allow 20% variance
      expect(functionCount).to.be.lte(contractInfo.expectedFunctions * 1.2);

      // Verify diverse function types
      expect(functionTypes.pure).to.be.gt(0);
      expect(functionTypes.view).to.be.gt(0);
      expect(functionTypes.payable).to.be.gt(0);
      expect(functionTypes.nonpayable).to.be.gt(0);
    }

    console.log("✅ All contract function distributions verified");
  });
});
