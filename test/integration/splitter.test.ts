import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import { PayRoxSplitterEngine } from '../../tools/splitter/engine';

describe('PayRox Splitter Integration', () => {
  let engine: PayRoxSplitterEngine;

  beforeEach(() => {
    engine = new PayRoxSplitterEngine();
  });

  describe('Upload and Analysis', () => {
    it('should analyze monolith contract', async () => {
      const mockFile = Buffer.from('contract test {}');
      const analysis = await engine.upload(mockFile, 'PayRoxMonolith.sol');

      expect(analysis).to.exist;
      expect(analysis.name).to.equal('PayRoxMonolith');
      expect(analysis.functions.length).to.be.greaterThan(0);
      expect(analysis.estimatedSize).to.be.greaterThan(70000); // >70KB
      expect(analysis.eip170Risk).to.equal('critical'); // >24KB
    });

    it('should detect EIP-170 risk correctly', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');

      if (analysis.estimatedSize > 23 * 1024) {
        expect(analysis.eip170Risk).to.equal('critical');
      } else if (analysis.estimatedSize > 20 * 1024) {
        expect(analysis.eip170Risk).to.equal('warning');
      } else {
        expect(analysis.eip170Risk).to.equal('safe');
      }
    });
  });

  describe('Split Plan Generation', () => {
    it('should generate core-view-logic split plan', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);

      expect(plan.strategy).to.equal('core-view-logic');
      expect(plan.facets.length).to.be.at.least(2);
      expect(plan.facets.some(f => f.name.includes('Core'))).to.be.true;
      expect(plan.facets.some(f => f.name.includes('View'))).to.be.true;
      expect(plan.totalSelectors).to.be.greaterThan(0);
    });

    it('should generate domain-buckets split plan', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'domain-buckets', 18);

      expect(plan.strategy).to.equal('domain-buckets');
      expect(plan.facets.length).to.be.at.least(1);
      expect(plan.facets.some(f => f.name.includes('Token') || f.name.includes('Admin'))).to.be.true;
    });

    it('should generate size-first split plan', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'size-first', 16);

      expect(plan.strategy).to.equal('size-first');
      expect(plan.targetFacetSize).to.equal(16);

      // Each facet should be roughly under target size
      plan.facets.forEach(facet => {
        expect(facet.estimatedRuntimeSize).to.be.at.most(18 * 1024); // Allow some margin
      });
    });

    it('should detect selector collisions', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);

      // Should not have collisions in proper split
      expect(plan.collisions).to.have.length(0);
    });

    it('should calculate storage namespaces', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);

      plan.facets.forEach(facet => {
        expect(facet.storageNamespace).to.match(/^[0-9a-f]{64}$/);
        expect(facet.storageNamespace).to.not.equal('0'.repeat(64));
      });
    });
  });

  describe('Artifact Generation', () => {
    it('should generate all required artifacts', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);
      const artifacts = await engine.generateArtifacts(plan);

      // Should have facets, interfaces, storage libs, manifest
      const facetFiles = artifacts.filter(a => a.type === 'facet');
      const interfaceFiles = artifacts.filter(a => a.type === 'interface');
      const storageFiles = artifacts.filter(a => a.type === 'storage');
      const manifestFiles = artifacts.filter(a => a.type === 'manifest');

      expect(facetFiles.length).toBe(plan.facets.length);
      expect(interfaceFiles.length).toBe(plan.facets.length);
      expect(storageFiles.length).toBe(plan.facets.length);
      expect(manifestFiles.length).toBeGreaterThanOrEqual(1);

      // Check file structure
      facetFiles.forEach(facet => {
        expect(facet.path).toMatch(/^facets\/.*\.sol$/);
        expect(facet.content).toContain('contract ');
        expect(facet.content).toContain('getFacetInfo()');
      });

      interfaceFiles.forEach(iface => {
        expect(iface.path).toMatch(/^interfaces\/I.*\.sol$/);
        expect(iface.content).toContain('interface ');
      });

      storageFiles.forEach(storage => {
        expect(storage.path).toMatch(/^libraries\/.*Storage\.sol$/);
        expect(storage.content).toContain('library ');
        expect(storage.content).toContain('STORAGE_SLOT');
      });
    });

    it('should generate valid Solidity syntax', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);
      const artifacts = await engine.generateArtifacts(plan);

      artifacts.filter(a => a.path.endsWith('.sol')).forEach(artifact => {
        // Basic syntax checks
        expect(artifact.content).toContain('pragma solidity');
        expect(artifact.content).toContain('SPDX-License-Identifier');

        // Should have balanced braces
        const openBraces = (artifact.content.match(/\{/g) || []).length;
        const closeBraces = (artifact.content.match(/\}/g) || []).length;
        expect(openBraces).toBe(closeBraces);
      });
    });

    it('should generate manifest with correct metadata', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);
      const artifacts = await engine.generateArtifacts(plan);

      const manifestArtifact = artifacts.find(a => a.path === 'manifest.json');
      expect(manifestArtifact).toBeDefined();

      const manifest = JSON.parse(manifestArtifact!.content);
      expect(manifest.version).toBeDefined();
      expect(manifest.strategy).toBe('core-view-logic');
      expect(manifest.facets).toHaveLength(plan.facets.length);
      expect(manifest.totalSelectors).toBe(plan.totalSelectors);
      expect(manifest.buildHash).toBeDefined();
    });
  });

  describe('Gate Validation', () => {
    it('should validate selector parity gate', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const mockCompilation = {
        success: true,
        facetSizes: new Map([['CoreFacet', 20000], ['ViewFacet', 15000]]),
        errors: [],
        warnings: [],
        buildHash: 'test-hash'
      };

      const gates = await engine.validateGates(analysis, mockCompilation);

      expect(gates.selector).toBeDefined();
      expect(gates.selector.missingFromFacets).toBeDefined();
      expect(gates.selector.extrasNotInMonolith).toBeDefined();
      expect(gates.selector.collisions).toBeDefined();
      expect(typeof gates.selector.passed).toBe('boolean');
    });

    it('should validate EIP-170 gate', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const mockCompilation = {
        success: true,
        facetSizes: new Map([
          ['CoreFacet', 20000],    // Under limit
          ['ViewFacet', 15000],    // Under limit
          ['HugeFacet', 30000]     // Over limit
        ]),
        errors: [],
        warnings: [],
        buildHash: 'test-hash'
      };

      const gates = await engine.validateGates(analysis, mockCompilation);

      expect(gates.eip170.passed).toBe(false);
      expect(gates.eip170.violations).toHaveLength(1);
      expect(gates.eip170.violations[0]).toContain('HugeFacet');
      expect(gates.eip170.violations[0]).toContain('30000');
    });
  });

  describe('Merkle Tree Building', () => {
    it('should build ordered merkle tree', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);
      const mockCompilation = {
        success: true,
        facetSizes: new Map([['CoreFacet', 20000]]),
        errors: [],
        warnings: [],
        buildHash: 'test-hash'
      };

      const merkle = await engine.buildMerkleTree(mockCompilation, plan);

      expect(merkle.root).toMatch(/^0x[0-9a-f]{64}$/);
      expect(merkle.leaves.length).toBe(plan.totalSelectors);
      expect(merkle.proofs.size).toBe(plan.totalSelectors);
      expect(merkle.positions.size).toBe(plan.totalSelectors);
      expect(merkle.packedSize).toBeGreaterThan(0);

      // Leaves should be sorted by selector
      for (let i = 1; i < merkle.leaves.length; i++) {
        const current = merkle.leaves[i];
        const previous = merkle.leaves[i-1];
        if (current && previous) {
          expect(current.selector >= previous.selector).toBe(true);
        }
      }
    });

    it('should generate unique leaf hashes', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);
      const mockCompilation = {
        success: true,
        facetSizes: new Map(),
        errors: [],
        warnings: [],
        buildHash: 'test-hash'
      };

      const merkle = await engine.buildMerkleTree(mockCompilation, plan);
      const leafHashes = merkle.leaves.map(l => l.leaf);
      const uniqueHashes = new Set(leafHashes);

      expect(uniqueHashes.size).toBe(leafHashes.length);
    });
  });

  describe('Dispatcher Plan Creation', () => {
    it('should create dispatcher plan with correct structure', async () => {
      const analysis = await engine.upload(Buffer.from(''), '');
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);
      const mockCompilation = {
        success: true,
        facetSizes: new Map(),
        errors: [],
        warnings: [],
        buildHash: 'test-hash'
      };
      const merkle = await engine.buildMerkleTree(mockCompilation, plan);
      const dispatcherPlan = await engine.createDispatcherPlan(merkle, plan, 86400); // 24h delay

      expect(dispatcherPlan.selectors).toHaveLength(plan.totalSelectors);
      expect(dispatcherPlan.facets).toHaveLength(plan.facets.length);
      expect(dispatcherPlan.codehashes).toHaveLength(plan.facets.length);
      expect(dispatcherPlan.delay).toBe(86400);
      expect(dispatcherPlan.eta).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(dispatcherPlan.merkleRoot).toBe(merkle.root);
      expect(dispatcherPlan.buildHash).toBeDefined();
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete end-to-end splitting workflow', async () => {
      // Step 1: Upload and analyze
      const analysis = await engine.upload(Buffer.from('test contract'), 'PayRoxMonolith.sol');
      expect(analysis.functions.length).toBeGreaterThan(0);

      // Step 2: Generate split plan
      const plan = await engine.generateSplitPlan(analysis, 'core-view-logic', 18);
      expect(plan.facets.length).toBeGreaterThan(0);
      expect(plan.collisions).toHaveLength(0);

      // Step 3: Generate artifacts
      const artifacts = await engine.generateArtifacts(plan);
      expect(artifacts.length).toBeGreaterThan(plan.facets.length);

      // Step 4: Mock compilation success
      const mockCompilation = {
        success: true,
        facetSizes: new Map(plan.facets.map(f => [f.name, 20000])),
        errors: [],
        warnings: [],
        buildHash: 'test-hash'
      };

      // Step 5: Validate gates
      const gates = await engine.validateGates(analysis, mockCompilation);
      expect(gates.selector.passed).toBe(true);
      expect(gates.eip170.passed).toBe(true);

      // Step 6: Build merkle tree
      const merkle = await engine.buildMerkleTree(mockCompilation, plan);
      expect(merkle.root).toBeDefined();

      // Step 7: Create dispatcher plan
      const dispatcherPlan = await engine.createDispatcherPlan(merkle, plan, 86400);
      expect(dispatcherPlan.eta).toBeGreaterThan(0);

      console.log('✅ Full workflow completed successfully');
      console.log(`   Generated ${plan.facets.length} facets with ${plan.totalSelectors} selectors`);
      console.log(`   Merkle root: ${merkle.root}`);
      console.log(`   Plan ETA: ${new Date(dispatcherPlan.eta * 1000).toISOString()}`);
    });
  });
});
