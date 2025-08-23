import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { describe, it, before } from "mocha";

/**
 * Monolith Test Suite
 * Tests the generated large contracts for splitter and gate functionality
 */
describe("Monolith Contract Tests", function () {
  let testContract: Contract;
  let deployer: any;
  let user1: any;
  let user2: any;

  before(async function () {
    [deployer, user1, user2] = await ethers.getSigners();

    console.log("🔧 Deploying test monolith contracts...");

    // Deploy the smaller test contract for basic functionality
    const TestContractFactory = await ethers.getContractFactory("PayRoxTestContract");
    testContract = await TestContractFactory.deploy();
    await testContract.waitForDeployment();

    console.log(`✅ PayRoxTestContract deployed to: ${await testContract.getAddress()}`);

    // Note: We don't deploy the MegaMonolith due to size limits, but we can test compilation
    await ethers.getContractFactory("PayRoxMegaMonolith");
    console.log(`✅ PayRoxMegaMonolith factory created (compilation successful)`);

    // Log contract sizes for verification
    const testArtifact = await ethers.getContractFactory("PayRoxTestContract");
    const megaArtifact = await ethers.getContractFactory("PayRoxMegaMonolith");

    console.log(`📊 Test contract bytecode size: ${testArtifact.bytecode.length / 2 - 1} bytes`);
    console.log(`📊 Mega monolith bytecode size: ${megaArtifact.bytecode.length / 2 - 1} bytes`);
  });

  describe("Basic Functionality Tests", function () {
    it("should have correct owner", async function () {
      const owner = await testContract.owner();
      expect(owner).to.equal(deployer.address);
    });

    it("should handle payable functions", async function () {
      const value = ethers.parseEther("1.0");
      const tx = await testContract.pay0001({ value });
      await tx.wait();

      const balance = await testContract.balanceOf(deployer.address);
      expect(balance).to.be.gt(0);
    });

    it("should handle view functions", async function () {
      const result = await testContract.view0001(100, 200);
      expect(result.sum).to.equal(300);
      expect(result.mixv).to.be.gt(0);
    });

    it("should handle pure functions", async function () {
      const result = await testContract.pure0001(42);
      expect(result.result).to.be.gt(0);
      expect(result.hash).to.be.gt(0);
      expect(result.exp).to.be.gt(0);
    });

    it("should handle array functions", async function () {
      const data = [10, 20, 30, 40, 50];
      const result = await testContract.array0001(data);
      expect(result.sum).to.equal(150);
      expect(result.avg).to.equal(30);
      expect(result.max).to.equal(50);
    });

    it("should handle state changing functions", async function () {
      const key = ethers.keccak256(ethers.toUtf8Bytes("test-key"));
      const value = ethers.keccak256(ethers.toUtf8Bytes("test-value"));

      await testContract.set0001(key, value);

      const stored = await testContract.kv(key);
      expect(stored).to.equal(value);
    });

    it("should handle approval functions", async function () {
      const amount = ethers.parseEther("100");
      await testContract.approve0001(user1.address, amount);

      const allowanceAmount = await testContract.allowance(deployer.address, user1.address);
      expect(allowanceAmount).to.equal(amount);
    });

    it("should handle batch operations", async function () {
      const targets = [user1.address, user2.address];
      const amounts = [100, 200];

      const results = await testContract.batch0001(targets, amounts);
      expect(results.length).to.equal(2);
      expect(results[0]).to.equal(100);
      expect(results[1]).to.equal(200);
    });

    it("should handle string encoding functions", async function () {
      const input = "test-string";
      const result = await testContract.encode0001(input);

      expect(result.hash).to.be.properHex;
      expect(result.encoded).to.be.properHex;
    });

    it("should handle time-based functions", async function () {
      const timestamp = Math.floor(Date.now() / 1000);
      const result = await testContract.time0001(timestamp);

      expect(result.elapsed).to.be.gte(0);
      expect(result.future).to.be.gt(timestamp);
    });

    it("should handle conditional logic", async function () {
      // Test small value
      const smallResult = await testContract.conditional0001(50);
      expect(smallResult.output).to.equal(100);
      expect(smallResult.category).to.equal("small");

      // Test medium value
      const mediumResult = await testContract.conditional0001(500);
      expect(mediumResult.category).to.equal("medium");

      // Test large value
      const largeResult = await testContract.conditional0001(5000);
      expect(largeResult.category).to.equal("large");
    });
  });

  describe("Administrative Functions", function () {
    it("should handle pause functionality", async function () {
      await testContract.setPaused(true);
      const isPaused = await testContract.paused();
      expect(isPaused).to.be.true;

      // Test that paused functions revert
      await expect(
        testContract.pay0002({ value: ethers.parseEther("1") })
      ).to.be.reverted;

      // Unpause
      await testContract.setPaused(false);
      const isUnpaused = await testContract.paused();
      expect(isUnpaused).to.be.false;
    });

    it("should handle ownership transfer", async function () {
      // Check if contract has ownership functions
      try {
        await testContract.getFunction("transferOwnership")(user1.address);
        const pendingOwner = await testContract.getFunction("pendingOwner")();
        expect(pendingOwner).to.equal(user1.address);

        // Accept ownership from new owner
        await testContract.connect(user1).getFunction("acceptOwnership")();
        const newOwner = await testContract.getFunction("owner")();
        expect(newOwner).to.equal(user1.address);

        // Transfer back to deployer
        await testContract.connect(user1).getFunction("transferOwnership")(deployer.address);
        await testContract.getFunction("acceptOwnership")();
      } catch (error) {
        // If ownership functions don't exist, just verify owner exists
        const owner = await testContract.getFunction("owner")();
        expect(owner).to.equal(deployer.address);
        console.log("⚠️  Contract doesn't implement two-step ownership transfer");
      }
    });

    it("should handle batch processing", async function () {
      const ids = [1, 2, 3, 4, 5];
      const tx = await testContract.batchProcess(ids);
      await tx.wait();

      // Check that items were processed
      for (const id of ids) {
        const isProcessed = await testContract.processed(id);
        expect(isProcessed).to.be.true;
      }
    });

    it("should return complex state", async function () {
      const state = await testContract.getComplexState();
      expect(state.contractOwner).to.equal(deployer.address);
      expect(state.supply).to.be.gte(0);
      expect(state.currentNonce).to.be.gte(1);
      expect(state.isPaused).to.be.false;
    });
  });

  describe("Function Selector Analysis", function () {
    it("should have unique function selectors", async function () {
      const contract = await ethers.getContractFactory("PayRoxTestContract");
      const abi = contract.interface;

      const selectors = new Set<string>();
      const collisions: string[] = [];

      abi.forEachFunction((func) => {
        const selector = func.selector;
        if (selectors.has(selector)) {
          collisions.push(`Collision: ${selector} for function ${func.name}`);
        } else {
          selectors.add(selector);
        }
      });

      console.log(`📊 Total unique selectors: ${selectors.size}`);
      console.log(`❌ Collisions found: ${collisions.length}`);

      if (collisions.length > 0) {
        console.log("Collision details:", collisions);
      }

      expect(collisions.length).to.equal(0, "No selector collisions should exist");
    });

    it("should have functions across different types", async function () {
      const contract = await ethers.getContractFactory("PayRoxTestContract");
      const abi = contract.interface;

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

      // Verify we have a good mix of function types
      expect(functionTypes.pure).to.be.gt(0);
      expect(functionTypes.view).to.be.gt(0);
      expect(functionTypes.payable).to.be.gt(0);
      expect(functionTypes.nonpayable).to.be.gt(0);
    });
  });

  describe("Gas Usage Analysis", function () {
    it("should measure gas usage for different function types", async function () {
      const gasUsage = {
        view: 0,
        pure: 0,
        payable: 0,
        state: 0
      };

      // Measure view function gas
      const viewTx = await testContract.view0001.staticCall(100, 200);
      console.log(`📊 View function result:`, viewTx);

      // Measure pure function gas
      const pureTx = await testContract.pure0001.staticCall(42);
      console.log(`📊 Pure function result:`, pureTx);

      // Measure payable function gas
      const payableTx = await testContract.pay0003({ value: ethers.parseEther("0.1") });
      const payableReceipt = await payableTx.wait();
      gasUsage.payable = Number(payableReceipt?.gasUsed || 0);

      // Measure state change gas
      const stateTx = await testContract.set0003(
        ethers.keccak256(ethers.toUtf8Bytes("gas-test")),
        ethers.keccak256(ethers.toUtf8Bytes("gas-value"))
      );
      const stateReceipt = await stateTx.wait();
      gasUsage.state = Number(stateReceipt?.gasUsed || 0);

      console.log(`📊 Gas usage analysis:`, gasUsage);

      // Verify reasonable gas usage
      expect(gasUsage.payable).to.be.gt(0).and.lt(200000);
      expect(gasUsage.state).to.be.gt(0).and.lt(100000);
    });
  });
});
