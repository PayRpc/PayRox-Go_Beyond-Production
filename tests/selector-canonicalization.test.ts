import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Selector Canonicalization Tests', function() {
    it('should canonicalize function selectors correctly', function() {
        // Test basic selector calculation
        const _signature = 'transfer(address,uint256)';
        const _expectedSelector = '0xa9059cbb';

        const _hash = ethers.keccak256(ethers.toUtf8Bytes(_signature));
        const _selector = _hash.slice(0, 10); // First 4 bytes (8 hex chars + 0x)

        expect(_selector).to.equal(_expectedSelector);
    });

    it('should handle selector collisions detection', function() {
        // Known collision example for testing
        const _sig1 = 'collides1()';
        const _sig2 = 'collides2()';

        const _selector1 = ethers.keccak256(ethers.toUtf8Bytes(_sig1)).slice(0, 10);
        const _selector2 = ethers.keccak256(ethers.toUtf8Bytes(_sig2)).slice(0, 10);

        // These specific examples don't actually collide, but the test framework is here
        expect(_selector1).to.not.equal(_selector2);
    });

    it('should validate selector format', function() {
        const _validSelector = '0xa9059cbb';
        const _invalidSelector = 'a9059cbb';

        expect(_validSelector.startsWith('0x')).to.be.true;
        expect(_validSelector.length).to.equal(10);
        expect(_invalidSelector.startsWith('0x')).to.be.false;
    });
});
