/**
 * Core types for the Solidity Contract Splitter System
 */

export interface CompilerConfig {
  version: string;
  optimizer: { enabled: boolean; runs: number };
  evmVersion: string;
  viaIR: boolean;
  metadataBytecodeHash: 'none' | 'ipfs' | 'bzzr1';
}

export interface NetworkProfile {
  name: 'Local' | 'Dev' | 'Testnet' | 'Mainnet';
  rpcUrl: string;
  create2SaltPrefix?: string;
}

export interface FunctionInfo {
  name: string;
  selector: string; // 0x12345678
  signature: string; // "transfer(address,uint256)"
  visibility: 'public' | 'external' | 'internal' | 'private';
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
  isConstructor: boolean;
  isFallback: boolean;
  isReceive: boolean;
  gasEstimate?: number;
  sourceLocation: {
    start: number;
    length: number;
    file: string;
  };
}

export interface StorageVariable {
  name: string;
  type: string;
  slot: number;
  offset: number;
  size: number;
  isConstant: boolean;
  isImmutable: boolean;
}

export interface ContractAnalysis {
  name: string;
  linesOfCode: number;
  functions: FunctionInfo[];
  storageVariables: StorageVariable[];
  imports: string[];
  spdxLicense?: string;
  pragma: string;
  estimatedSize: number; // bytes
  eip170Risk: 'safe' | 'warning' | 'critical'; // <20KB / 20-23KB / >23KB
}

export interface FacetInfo {
  name: string;
  functions: FunctionInfo[];
  estimatedRuntimeSize: number; // bytes
  selectorCount: number;
  storageNamespace: string; // bytes32 slot
  isCore: boolean;
}

export interface SplitPlan {
  strategy: 'core-view-logic' | 'domain-buckets' | 'size-first';
  targetFacetSize: number; // KB
  facets: FacetInfo[];
  collisions: string[]; // selector collisions
  totalSelectors: number;
  estimatedGasSavings: number;
}

export interface GeneratedArtifact {
  path: string;
  content: string;
  type: 'facet' | 'interface' | 'storage' | 'manifest' | 'script';
  size: number;
}

export interface CompilationResult {
  success: boolean;
  facetSizes: Map<string, number>; // facet name -> deployed bytecode size
  errors: string[];
  warnings: string[];
  buildHash: string;
}

export interface SelectorGate {
  missingFromFacets: string[]; // selectors in monolith but not in facets
  extrasNotInMonolith: string[]; // selectors in facets but not in monolith
  collisions: string[]; // duplicate selectors across facets
  passed: boolean;
}

export interface EIP170Gate {
  facetSizes: Map<string, number>;
  violations: string[]; // facets exceeding 24,576 bytes
  passed: boolean;
}

export interface MerkleLeaf {
  selector: string;
  facet: string;
  codehash: string;
  leaf: string; // keccak256(abi.encode(selector, facet, codehash))
}

export interface MerkleTree {
  root: string;
  leaves: MerkleLeaf[];
  proofs: Map<string, string[]>; // selector -> proof array
  positions: Map<string, number>; // selector -> position in tree
  packedSize: number; // bytes for all proofs
}

export interface DispatcherPlan {
  selectors: string[];
  facets: string[];
  codehashes: string[];
  eta: number; // timestamp when plan can be applied
  delay: number; // governance delay in seconds
  buildHash: string;
  merkleRoot: string;
}

export interface DeploymentResult {
  facetAddresses: Map<string, string>; // facet name -> deployed address
  observedCodehashes: Map<string, string>; // facet name -> actual codehash
  predictedMatches: boolean;
  transactionHashes: string[];
}

export interface WorkflowState {
  step: 'upload' | 'analyze' | 'split' | 'generate' | 'compile' | 'merkle' | 'dispatch' | 'package';
  status: 'idle' | 'running' | 'passed' | 'failed';
  buildHash: string;
  mode: 'predictive' | 'observed';
  reproducible: boolean;
}

export interface SplitterEngine {
  // Core workflow methods
  upload(file: Buffer, filename: string): Promise<ContractAnalysis>;
  analyze(source: string, config: CompilerConfig): Promise<ContractAnalysis>;
  generateSplitPlan(analysis: ContractAnalysis, strategy: SplitPlan['strategy'], targetSize: number): Promise<SplitPlan>;
  generateArtifacts(plan: SplitPlan): Promise<GeneratedArtifact[]>;
  compile(artifacts: GeneratedArtifact[], config: CompilerConfig): Promise<CompilationResult>;
  validateGates(monolith: ContractAnalysis, compilation: CompilationResult): Promise<{ selector: SelectorGate; eip170: EIP170Gate }>;
  buildMerkleTree(compilation: CompilationResult, plan: SplitPlan): Promise<MerkleTree>;
  createDispatcherPlan(merkle: MerkleTree, plan: SplitPlan, delay: number): Promise<DispatcherPlan>;

  // Optional deployment methods
  deployFacets?(plan: SplitPlan, network: NetworkProfile): Promise<DeploymentResult>;
  commitPlan?(dispatcherPlan: DispatcherPlan, network: NetworkProfile): Promise<string>;
  applyPlan?(dispatcherPlan: DispatcherPlan, network: NetworkProfile): Promise<string>;
}

export interface BuildMetadata {
  timestamp: number;
  solcVersion: string;
  optimizer: { enabled: boolean; runs: number };
  evmVersion: string;
  viaIR: boolean;
  commitHash?: string;
  reproducibleHash: string; // SHA256 of all inputs
  signature?: string; // GPG/Sigstore signature
}
