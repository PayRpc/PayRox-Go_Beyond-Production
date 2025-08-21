import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('Generated Facet smoke', () => {
  it('generates facet with correct interface', async () => {
    // Note: Change "PaymentsFacet" to your actual generated facet name
    const Facet = await ethers.getContractFactory('PaymentsFacet')
    const facet = await Facet.deploy()
    await facet.waitForDeployment()

    // Test that the facet has the expected interface
    const facetInfo = await (facet as any).getFacetInfo()
    expect(facetInfo.name).to.equal('PaymentsFacet')
    expect(facetInfo.version).to.equal('1.0.0')
    expect(facetInfo.selectors.length).to.equal(5)

    // Test ERC-165 support
    expect(await (facet as any).supportsInterface('0x01ffc9a7')).to.be.true // ERC165

    // Test OPERATOR_ROLE constant
    const operatorRole = await (facet as any).OPERATOR_ROLE()
    expect(operatorRole).to.be.a('string')
    
    console.log('✅ Generated facet has correct structure and interface')
    console.log('Note: To test full functionality, deploy this facet within a PayRox Diamond system')
  })
})
