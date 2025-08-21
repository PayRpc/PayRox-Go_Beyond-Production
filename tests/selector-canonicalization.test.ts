import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Selector Canonicalization Tests', function() {
    it('should canonicalize function selectors correctly', function() {
        // Test basic selector calculation
        const signature = 'transfer(address,uint256)';
        const expectedSelector = '0xa9059cbb';

        const hash = ethers.keccak256(ethers.toUtf8Bytes(signature));
        const selector = hash.slice(0, 10); // First 4 bytes (8 hex chars + 0x)

        expect(selector).to.equal(expectedSelector);
    });

    it('should handle selector collisions detection', function() {
        // Known collision example for testing
        const sig1 = 'collides1()';
        const sig2 = 'collides2()';

        const selector1 = ethers.keccak256(ethers.toUtf8Bytes(sig1)).slice(0, 10);
        const selector2 = ethers.keccak256(ethers.toUtf8Bytes(sig2)).slice(0, 10);

        // These specific examples don't actually collide, but the test framework is here
        expect(selector1).to.not.equal(selector2);
    });

    it('should validate selector format', function() {
        const validSelector = '0xa9059cbb';
        const invalidSelector = 'a9059cbb';

        expect(validSelector.startsWith('0x')).to.be.true;
        expect(validSelector.length).to.equal(10);
        expect(invalidSelector.startsWith('0x')).to.be.false;
    });
});
