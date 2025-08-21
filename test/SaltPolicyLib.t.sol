// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {SaltPolicyLib as S} from "../contracts/libraries/SaltPolicyLib.sol";

contract SaltPolicyLibTest is Test {
    // Test constants
    address constant DEPLOYER = address(0xAbCd);
    uint256 constant CHAIN_ID = 11_155_111;
    bytes32 constant CONTENT_HASH = keccak256("content");
    uint256 constant CROSS_NONCE = 42;
    bytes32 constant VERSION_HASH = keccak256("1.2.3");
    string constant VERSION_STRING = "1.2.3";
    string constant CONTENT_STRING = "content";

    // Sample init code (tiny runtime that stores 1 and returns it)
    bytes constant INIT_CODE = hex"600160005260206000F3";

    function test_universalSaltHashedChain_typesAndParity() public {
        bytes32 onchain = S.universalSaltHashedChain(
            CHAIN_ID, 
            DEPLOYER, 
            CONTENT_HASH, 
            CROSS_NONCE, 
            VERSION_HASH
        );

        // Mirror the exact types off-chain; here we recompute in-solidity as a guard:
        bytes32 expected = keccak256(
            abi.encodePacked(
                "PayRoxCrossChain:v1",
                CHAIN_ID,
                DEPLOYER,
                CONTENT_HASH,
                CROSS_NONCE,
                VERSION_HASH
            )
        );
        assertEq(onchain, expected, "salt mismatch");
    }

    function test_universalSaltHashed_typesAndParity() public {
        bytes32 onchain = S.universalSaltHashed(
            DEPLOYER, 
            CONTENT_HASH, 
            CROSS_NONCE, 
            VERSION_HASH
        );

        // Mirror the exact types off-chain; here we recompute in-solidity as a guard:
        bytes32 expected = keccak256(
            abi.encodePacked(
                "PayRoxCrossChain:v1",
                DEPLOYER,
                CONTENT_HASH,
                CROSS_NONCE,
                VERSION_HASH
            )
        );
        assertEq(onchain, expected, "salt mismatch");
    }

    function test_universalSalt_legacy_parity() public {
        bytes32 onchain = S.universalSalt(
            DEPLOYER, 
            CONTENT_STRING, 
            CROSS_NONCE, 
            VERSION_STRING
        );

        // Mirror the exact types off-chain; here we recompute in-solidity as a guard:
        bytes32 expected = keccak256(
            abi.encodePacked(
                "PayRoxCrossChain:v1",
                DEPLOYER,
                CONTENT_STRING,
                CROSS_NONCE,
                VERSION_STRING
            )
        );
        assertEq(onchain, expected, "salt mismatch");
    }

    function test_universalSaltHashedHere_usesBlockChainId() public {
        // Set the chain ID via vm.chainId
        vm.chainId(CHAIN_ID);
        
        bytes32 here = S.universalSaltHashedHere(
            DEPLOYER, 
            CONTENT_HASH, 
            CROSS_NONCE, 
            VERSION_HASH
        );
        
        bytes32 explicit = S.universalSaltHashedChain(
            CHAIN_ID, 
            DEPLOYER, 
            CONTENT_HASH, 
            CROSS_NONCE, 
            VERSION_HASH
        );
        
        assertEq(here, explicit, "Here variant should match explicit chain ID");
    }

    function test_factorySalt_parity() public {
        bytes32 onchain = S.factorySalt(VERSION_STRING);
        
        bytes32 expected = keccak256(
            abi.encodePacked(
                "PayRoxFactory:v1",
                VERSION_STRING
            )
        );
        assertEq(onchain, expected, "factory salt mismatch");
    }

    function test_factorySaltHashed_parity() public {
        bytes32 onchain = S.factorySaltHashed(VERSION_HASH);
        
        bytes32 expected = keccak256(
            abi.encodePacked(
                "PayRoxFactory:v1",
                VERSION_HASH
            )
        );
        assertEq(onchain, expected, "hashed factory salt mismatch");
    }

    function test_create2Address_matchesOZ() public {
        address deployer = address(0xDePl0y);
        bytes32 initHash = keccak256(INIT_CODE);
        bytes32 salt = keccak256("salt");

        address a = S.create2Address(deployer, salt, initHash);
        address b = S.create2AddressFromInitCode(deployer, salt, INIT_CODE);
        address c = Create2.computeAddress(salt, initHash, deployer);

        assertEq(a, c, "create2 mismatch");
        assertEq(b, c, "create2-from-init mismatch");
    }

    function test_salts_differ_across_parameters() public {
        // Different content hashes should produce different salts
        bytes32 salt1 = S.universalSaltHashed(DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH);
        bytes32 salt2 = S.universalSaltHashed(DEPLOYER, keccak256("different"), CROSS_NONCE, VERSION_HASH);
        assertTrue(salt1 != salt2, "Different content should produce different salts");

        // Different version hashes should produce different salts
        bytes32 salt3 = S.universalSaltHashed(DEPLOYER, CONTENT_HASH, CROSS_NONCE, keccak256("different"));
        assertTrue(salt1 != salt3, "Different version should produce different salts");

        // Different nonces should produce different salts
        bytes32 salt4 = S.universalSaltHashed(DEPLOYER, CONTENT_HASH, 999, VERSION_HASH);
        assertTrue(salt1 != salt4, "Different nonce should produce different salts");

        // Different deployers should produce different salts
        bytes32 salt5 = S.universalSaltHashed(address(0x1234), CONTENT_HASH, CROSS_NONCE, VERSION_HASH);
        assertTrue(salt1 != salt5, "Different deployer should produce different salts");
    }

    function test_salts_differ_across_chainIds() public {
        bytes32 salt1 = S.universalSaltHashedChain(1, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH);
        bytes32 salt2 = S.universalSaltHashedChain(137, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH);
        bytes32 salt3 = S.universalSaltHashedChain(11155111, DEPLOYER, CONTENT_HASH, CROSS_NONCE, VERSION_HASH);
        
        assertTrue(salt1 != salt2, "Different chain IDs should produce different salts (1 vs 137)");
        assertTrue(salt1 != salt3, "Different chain IDs should produce different salts (1 vs sepolia)");
        assertTrue(salt2 != salt3, "Different chain IDs should produce different salts (137 vs sepolia)");
    }

    function test_initCodeHash() public {
        bytes32 hash1 = S.initCodeHash(INIT_CODE);
        bytes32 hash2 = keccak256(INIT_CODE);
        assertEq(hash1, hash2, "initCodeHash should match direct keccak256");
    }

    function test_domainVersioning() public {
        // Ensure domain constants are properly versioned
        assertEq(S.DOMAIN, "PayRoxCrossChain:v1", "Domain should be versioned");
        assertEq(S.FACTORY_DOMAIN, "PayRoxFactory:v1", "Factory domain should be versioned");
    }

    function test_eip2470_constant() public {
        assertEq(S.EIP2470, 0x4e59b44847b379578588920cA78FbF26c0B4956C, "EIP-2470 address constant");
    }

    // Fuzz test to ensure determinism
    function testFuzz_determinism(
        address deployer,
        bytes32 contentHash,
        uint256 crossNonce,
        bytes32 versionHash,
        uint256 chainId
    ) public {
        // Same inputs should always produce same outputs
        bytes32 salt1 = S.universalSaltHashedChain(chainId, deployer, contentHash, crossNonce, versionHash);
        bytes32 salt2 = S.universalSaltHashedChain(chainId, deployer, contentHash, crossNonce, versionHash);
        assertEq(salt1, salt2, "Same inputs must produce same salt");

        // Non-chain variant should be deterministic too
        bytes32 salt3 = S.universalSaltHashed(deployer, contentHash, crossNonce, versionHash);
        bytes32 salt4 = S.universalSaltHashed(deployer, contentHash, crossNonce, versionHash);
        assertEq(salt3, salt4, "Same inputs must produce same salt (non-chain)");
    }
}
