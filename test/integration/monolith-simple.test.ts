import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * Monolith Test Suite - Simple version
 * Tests the generated large contracts for splitter and gate functionality
 */
describe("Monolith Contract Tests", function () {
  let testContract: any;
  let deployer: any;
  let user1: any;

  before(async function () {
    [deployer, user1] = await ethers.getSigners();

    console.log("🔧 Deploying test monolith contract...");

    // Deploy the smaller test contract for basic functionality
    const TestContractFactory = await ethers.getContractFactory("PayRoxTestContract");
    testContract = await TestContractFactory.deploy();
    await testContract.waitForDeployment();

    console.log(`✅ PayRoxTestContract deployed to: ${await testContract.getAddress()}`);

    // Log contract size
    const testArtifact = await ethers.getContractFactory("PayRoxTestContract");
    console.log(`📊 Test contract bytecode size: ${testArtifact.bytecode.length / 2 - 1} bytes`);
  });

  describe("Basic Functionality Tests", function () {
    it("should have correct owner", async function () {
      const owner = await testContract.owner();
      expect(owner).to.equal(deployer.address);
    });

    it("should handle pure functions", async function () {
      const result = await testContract.pure0001(42);
      expect(result.result).to.be.gt(0);
      expect(result.hash).to.be.gt(0);
      expect(result.exp).to.be.gt(0);
      console.log("✅ Pure function test passed");
    });

    it("should handle payable functions", async function () {
      const value = ethers.parseEther("1.0");
      const tx = await testContract.pay0002({ value });
      await tx.wait();

      const balance = await testContract.balanceOf(deployer.address);
      expect(balance).to.be.gt(0);
      console.log(`✅ Payable function test passed, balance: ${ethers.formatEther(balance)} ETH`);
    });

    it("should handle state changing functions", async function () {
      const key = ethers.keccak256(ethers.toUtf8Bytes("test-key"));
      const value = ethers.keccak256(ethers.toUtf8Bytes("test-value"));

      await testContract.set0003(key, value);

      const stored = await testContract.kv(key);
      expect(stored).to.equal(value);
      console.log("✅ State change function test passed");
    });

    it("should handle array functions", async function () {
      const data = [10, 20, 30, 40, 50];
      const result = await testContract.array0005(data);
      expect(result.sum).to.equal(150);
      expect(result.avg).to.equal(30);
      expect(result.max).to.equal(50);
      console.log("✅ Array function test passed");
    });

    it("should handle approval functions", async function () {
      const amount = ethers.parseEther("100");
      await testContract.approve0006(user1.address, amount);

      const allowanceAmount = await testContract.allowance(deployer.address, user1.address);
      expect(allowanceAmount).to.equal(amount);
      console.log("✅ Approval function test passed");
    });

    it("should handle batch operations", async function () {
      const targets = [user1.address, deployer.address];
      const amounts = [100, 200];

      const results = await testContract.batch0007(targets, amounts);
      expect(results.length).to.equal(2);
      console.log("✅ Batch operation test passed");
    });
  });

  describe("Contract Size and Compilation", function () {
    it("should confirm large contract compilation", async function () {
      // Just verify we can create the factory for the mega monolith
      const MegaMonolithFactory = await ethers.getContractFactory("PayRoxMegaMonolith");
      expect(MegaMonolithFactory).to.not.be.undefined;

      const bytecodeSize = MegaMonolithFactory.bytecode.length / 2 - 1;
      console.log(`📊 Mega monolith bytecode size: ${bytecodeSize} bytes`);

      // Should be large enough to test splitter functionality
      expect(bytecodeSize).to.be.gt(60000); // Greater than 60KB
      console.log("✅ Large contract compilation test passed");
    });
  });

  describe("Function Selector Analysis", function () {
    it("should have many unique function selectors", async function () {
      const TestContractFactory = await ethers.getContractFactory("PayRoxTestContract");
      const abi = TestContractFactory.interface;

      const selectors = new Set<string>();
      let functionCount = 0;

      abi.forEachFunction((func) => {
        selectors.add(func.selector);
        functionCount++;
      });

      console.log(`📊 Total functions: ${functionCount}`);
      console.log(`📊 Unique selectors: ${selectors.size}`);

      // Should have many functions for testing
      expect(functionCount).to.be.gt(100);
      expect(selectors.size).to.equal(functionCount); // All should be unique
      console.log("✅ Selector analysis test passed");
    });

    it("should have diverse function types", async function () {
      const TestContractFactory = await ethers.getContractFactory("PayRoxTestContract");
      const abi = TestContractFactory.interface;

      const functionTypes = {
        pure: 0,
        view: 0,
        payable: 0,
        nonpayable: 0
      };

      abi.forEachFunction((func) => {
        if (func.stateMutability === "pure") functionTypes.pure++;
        else if (func.stateMutability === "view") functionTypes.view++;
        else if (func.stateMutability === "payable") functionTypes.payable++;
        else functionTypes.nonpayable++;
      });

      console.log(`📊 Function type distribution:`, functionTypes);

      // Verify we have a good mix of function types for testing
      expect(functionTypes.pure).to.be.gt(10);
      expect(functionTypes.view).to.be.gt(10);
      expect(functionTypes.payable).to.be.gt(5);
      expect(functionTypes.nonpayable).to.be.gt(10);
      console.log("✅ Function type diversity test passed");
    });
  });

  describe("Administrative Functions", function () {
    it("should handle pause functionality", async function () {
      await testContract.setPaused(true);
      const isPaused = await testContract.paused();
      expect(isPaused).to.be.true;

      // Unpause for other tests
      await testContract.setPaused(false);
      const isUnpaused = await testContract.paused();
      expect(isUnpaused).to.be.false;
      console.log("✅ Pause functionality test passed");
    });

    it("should handle complex state queries", async function () {
      const state = await testContract.getComplexState();
      expect(state.contractOwner).to.equal(deployer.address);
      expect(state.supply).to.be.gte(0);
      expect(state.currentNonce).to.be.gte(1);
      expect(state.isPaused).to.be.false;
      console.log("✅ Complex state query test passed");
    });
  });

  describe("Gas Usage Analysis", function () {
    it("should measure gas usage for complex operations", async function () {
      // Test payable function gas usage
      const value = ethers.parseEther("0.1");
      const payableTx = await testContract.pay0002({ value });
      const payableReceipt = await payableTx.wait();
      const payableGas = Number(payableReceipt?.gasUsed || 0);

      // Test state change gas usage
      const stateTx = await testContract.set0003(
        ethers.keccak256(ethers.toUtf8Bytes("gas-test")),
        ethers.keccak256(ethers.toUtf8Bytes("gas-value"))
      );
      const stateReceipt = await stateTx.wait();
      const stateGas = Number(stateReceipt?.gasUsed || 0);

      console.log(`📊 Gas usage - Payable: ${payableGas}, State change: ${stateGas}`);

      // Verify reasonable gas usage
      expect(payableGas).to.be.gt(0).and.lt(200000);
      expect(stateGas).to.be.gt(0).and.lt(100000);
      console.log("✅ Gas usage analysis test passed");
    });
  });
});
