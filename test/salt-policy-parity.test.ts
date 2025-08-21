import { expect } from "chai";
import { ethers } from "hardhat";
import { solidityPackedKeccak256, getCreate2Address, keccak256, toUtf8Bytes } from "ethers";

describe("SaltPolicyLib - TypeScript Parity", function () {
  let saltPolicyLibContract: any;

  // Test constants (matching Foundry tests)
  const DEPLOYER = "0x000000000000000000000000000000000000AbCd";
  const CHAIN_ID = 11155111n; // Sepolia
  const CONTENT_HASH = keccak256(toUtf8Bytes("content"));
  const CROSS_NONCE = 42n;
  const VERSION_HASH = keccak256(toUtf8Bytes("1.2.3"));
  const VERSION_STRING = "1.2.3";
  const CONTENT_STRING = "content";

  // Domain constants
  const DOMAIN = "PayRoxCrossChain:v1";
  const FACTORY_DOMAIN = "PayRoxFactory:v1";

  // Sample init code (tiny runtime that stores 1 and returns it)
  const INIT_CODE = "0x600160005260206000F3";

  before(async function () {
    // Deploy a test contract that uses SaltPolicyLib
    const TestContract = await ethers.getContractFactory("TestContract");
    
    // Create a simple test contract that exposes SaltPolicyLib functions
    const testContractCode = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../contracts/libraries/SaltPolicyLib.sol";

contract TestSaltPolicyLib {
    function universalSaltHashedChain(
        uint256 chainId,
        address deployer,
        bytes32 contentHash,
        uint256 crossNonce,
        bytes32 versionHash
    ) public pure returns (bytes32) {
        return SaltPolicyLib.universalSaltHashedChain(chainId, deployer, contentHash, crossNonce, versionHash);
    }
    
    function universalSaltHashed(
        address deployer,
        bytes32 contentHash,
        uint256 crossNonce,
        bytes32 versionHash
    ) public pure returns (bytes32) {
        return SaltPolicyLib.universalSaltHashed(deployer, contentHash, crossNonce, versionHash);
    }
    
    function universalSalt(
        address deployer,
        string memory content,
        uint256 crossNonce,
        string memory version
    ) public pure returns (bytes32) {
        return SaltPolicyLib.universalSalt(deployer, content, crossNonce, version);
    }
    
    function factorySalt(string memory version) public pure returns (bytes32) {
        return SaltPolicyLib.factorySalt(version);
    }
    
    function factorySaltHashed(bytes32 versionHash) public pure returns (bytes32) {
        return SaltPolicyLib.factorySaltHashed(versionHash);
    }
    
    function create2Address(
        address deployer,
        bytes32 salt,
        bytes32 initHash
    ) public pure returns (address) {
        return SaltPolicyLib.create2Address(deployer, salt, initHash);
    }
    
    function create2AddressFromInitCode(
        address deployer,
        bytes32 salt,
        bytes memory initCode
    ) public pure returns (address) {
        return SaltPolicyLib.create2AddressFromInitCode(deployer, salt, initCode);
    }
}`;

    // For now, we'll skip deployment and just test the TypeScript parity directly
    console.log("Note: Testing TypeScript parity without contract deployment");
  });

  describe("Universal Salt Variants", function () {
    it("should match TypeScript universalSaltHashedChain parity", async function () {
      // Call Solidity function
      const soliditySalt = await saltPolicyLib.universalSaltHashedChain(
        CHAIN_ID,
        DEPLOYER,
        CONTENT_HASH,
        CROSS_NONCE,
        VERSION_HASH
      );

      // MUST match library's abi.encodePacked type list exactly:
      // ["string","uint256","address","bytes32","uint256","bytes32"]
      const typescriptSalt = solidityPackedKeccak256(
        ["string", "uint256", "address", "bytes32", "uint256", "bytes32"],
        [DOMAIN, CHAIN_ID, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH]
      );

      expect(soliditySalt).to.equal(typescriptSalt, "Chain-scoped salt parity failed");
    });

    it("should match TypeScript universalSaltHashed parity", async function () {
      // Call Solidity function
      const soliditySalt = await saltPolicyLib.universalSaltHashed(
        DEPLOYER,
        CONTENT_HASH,
        CROSS_NONCE,
        VERSION_HASH
      );

      // Type list: ["string","address","bytes32","uint256","bytes32"]
      const typescriptSalt = solidityPackedKeccak256(
        ["string", "address", "bytes32", "uint256", "bytes32"],
        [DOMAIN, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH]
      );

      expect(soliditySalt).to.equal(typescriptSalt, "Hashed salt parity failed");
    });

    it("should match TypeScript universalSalt legacy parity", async function () {
      // Call Solidity function
      const soliditySalt = await saltPolicyLib.universalSalt(
        DEPLOYER,
        CONTENT_STRING,
        CROSS_NONCE,
        VERSION_STRING
      );

      // Type list: ["string","address","string","uint256","string"]
      const typescriptSalt = solidityPackedKeccak256(
        ["string", "address", "string", "uint256", "string"],
        [DOMAIN, DEPLOYER, CONTENT_STRING, CROSS_NONCE, VERSION_STRING]
      );

      expect(soliditySalt).to.equal(typescriptSalt, "Legacy salt parity failed");
    });
  });

  describe("Factory Salt Variants", function () {
    it("should match TypeScript factorySalt parity", async function () {
      // Call Solidity function
      const soliditySalt = await saltPolicyLib.factorySalt(VERSION_STRING);

      // Type list: ["string","string"]
      const typescriptSalt = solidityPackedKeccak256(
        ["string", "string"],
        [FACTORY_DOMAIN, VERSION_STRING]
      );

      expect(soliditySalt).to.equal(typescriptSalt, "Factory salt parity failed");
    });

    it("should match TypeScript factorySaltHashed parity", async function () {
      // Call Solidity function
      const soliditySalt = await saltPolicyLib.factorySaltHashed(VERSION_HASH);

      // Type list: ["string","bytes32"]
      const typescriptSalt = solidityPackedKeccak256(
        ["string", "bytes32"],
        [FACTORY_DOMAIN, VERSION_HASH]
      );

      expect(soliditySalt).to.equal(typescriptSalt, "Hashed factory salt parity failed");
    });
  });

  describe("CREATE2 Address Computation", function () {
    it("should match ethers getCreate2Address", async function () {
      const deployerAddr = "0xDePl0yDePl0yDePl0yDePl0yDePl0yDePl0yDePl0y";
      const salt = keccak256(toUtf8Bytes("salt"));
      const initHash = keccak256(INIT_CODE);

      // Call Solidity functions
      const solidityAddr1 = await saltPolicyLib.create2Address(deployerAddr, salt, initHash);
      const solidityAddr2 = await saltPolicyLib.create2AddressFromInitCode(deployerAddr, salt, INIT_CODE);

      // Compute with ethers
      const ethersAddr = getCreate2Address(deployerAddr, salt, initHash);

      expect(solidityAddr1).to.equal(ethersAddr, "create2Address parity failed");
      expect(solidityAddr2).to.equal(ethersAddr, "create2AddressFromInitCode parity failed");
    });

    it("should demonstrate full CREATE2 workflow", async function () {
      // Use realistic parameters
      const factoryAddr = "0x4e59b44847b379578588920cA78FbF26c0B4956C"; // EIP-2470
      
      // Generate salt using library
      const salt = await saltPolicyLib.universalSaltHashedChain(
        CHAIN_ID,
        DEPLOYER,
        CONTENT_HASH,
        CROSS_NONCE,
        VERSION_HASH
      );

      // Compute address off-chain
      const initHash = keccak256(INIT_CODE);
      const ethersAddr = getCreate2Address(factoryAddr, salt, initHash);

      // Compute address on-chain
      const solidityAddr = await saltPolicyLib.create2Address(factoryAddr, salt, initHash);

      expect(solidityAddr).to.equal(ethersAddr, "Full CREATE2 workflow parity failed");

      console.log("🧭 CREATE2 Workflow:");
      console.log("  Salt:", salt);
      console.log("  InitHash:", initHash);
      console.log("  Address:", ethersAddr);
    });
  });

  describe("Cross-Chain Determinism", function () {
    it("should produce different salts for different chain IDs", async function () {
      const mainnetSalt = await saltPolicyLib.universalSaltHashedChain(
        1n, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH
      );
      
      const polygonSalt = await saltPolicyLib.universalSaltHashedChain(
        137n, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH
      );
      
      const sepoliaSalt = await saltPolicyLib.universalSaltHashedChain(
        CHAIN_ID, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH
      );

      expect(mainnetSalt).to.not.equal(polygonSalt, "Mainnet and Polygon should differ");
      expect(mainnetSalt).to.not.equal(sepoliaSalt, "Mainnet and Sepolia should differ");
      expect(polygonSalt).to.not.equal(sepoliaSalt, "Polygon and Sepolia should differ");

      console.log("🌐 Cross-Chain Salts:");
      console.log("  Mainnet (1):", mainnetSalt);
      console.log("  Polygon (137):", polygonSalt);
      console.log("  Sepolia (11155111):", sepoliaSalt);
    });

    it("should produce same addresses for same salt but different for different salts", async function () {
      const factoryAddr = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
      const initHash = keccak256(INIT_CODE);

      // Same salt should produce same address
      const salt1 = await saltPolicyLib.universalSaltHashed(DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH);
      const addr1a = await saltPolicyLib.create2Address(factoryAddr, salt1, initHash);
      const addr1b = await saltPolicyLib.create2Address(factoryAddr, salt1, initHash);
      expect(addr1a).to.equal(addr1b, "Same salt should produce same address");

      // Different salt should produce different address
      const salt2 = await saltPolicyLib.universalSaltHashed(DEPLOYER, keccak256(toUtf8Bytes("different")), CROSS_NONCE, VERSION_HASH);
      const addr2 = await saltPolicyLib.create2Address(factoryAddr, salt2, initHash);
      expect(addr1a).to.not.equal(addr2, "Different salt should produce different address");
    });
  });

  describe("Type Safety Validation", function () {
    it("should demonstrate exact type requirements", async function () {
      // This test documents the exact type requirements for off-chain parity
      
      // Example of what will FAIL (wrong types):
      // const wrongSalt = solidityPackedKeccak256(
      //   ["string", "uint256", "address", "string", "uint256", "string"], // string instead of bytes32
      //   [DOMAIN, CHAIN_ID, DEPLOYER, CONTENT_STRING, CROSS_NONCE, VERSION_STRING]
      // );
      
      // Correct types for universalSaltHashedChain:
      const correctSalt = solidityPackedKeccak256(
        ["string", "uint256", "address", "bytes32", "uint256", "bytes32"],
        [DOMAIN, CHAIN_ID, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH]
      );

      const soliditySalt = await saltPolicyLib.universalSaltHashedChain(
        CHAIN_ID, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH
      );

      expect(soliditySalt).to.equal(correctSalt, "Type requirements must be exact");
    });
  });
});
