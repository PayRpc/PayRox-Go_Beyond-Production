// Minimal type definitions to satisfy TypeScript checks for the refactor analyzer.
// These are intentionally conservative; expand as needed for runtime correctness.

export interface FunctionInfo {
  name: string;
  signature?: string;
  selector?: string;
  params?: any;
  parameters?: any[];
  returnParameters?: any[];
  returns?: string;
  stateMutability?: 'view' | 'pure' | 'payable' | 'nonpayable' | string;
  visibility?: string;
  modifiers?: string[];
  gasEstimate?: number;
  codeSize?: number;
  dependencies?: any[];
  [k: string]: any;
}

export interface VariableInfo {
  name: string;
  slot: number;
  offset: number;
  type: string;
  visibility?: string;
  size?: number;
  [k: string]: any;
}

export interface EventInfo {
  name: string;
  signature?: string;
  parameters?: any[];
  [k: string]: any;
}

export interface ModifierInfo {
  name: string;
  parameters?: any[];
  [k: string]: any;
}

export interface ImportInfo {
  path: string;
  symbols?: any[];
  [k: string]: any;
}

export interface ParameterInfo {
  name?: string;
  type?: string;
  [k: string]: any;
}

export type SourcePoint = { line: number; column: number };
export interface SourceLocation {
  // accept either numeric offsets or line/column pairs
  start?: number | SourcePoint;
  end?: number | SourcePoint;
  [k: string]: any;
}

export interface StorageSlot {
  slot: number;
  offset: number;
  label?: string;
  size?: number;
  [k: string]: any;
}

export interface CompilationError {
  severity?: string;
  message?: string;
  [k: string]: any;
}

// allow being used as a runtime error class too
export class CompilationErrorClass extends Error {
  errors?: any;
  constructor(message?: string, errors?: any) {
    super(message);
    this.name = 'CompilationError';
    this.errors = errors;
  }
}

export const CompilationError = CompilationErrorClass;

export class AnalysisError extends Error {}

export interface ManifestRoute {
  name: string;
  path?: string;
  selector?: string;
  facet?: string;
  codehash?: string;
  functionName?: string;
  gasEstimate?: number;
  securityLevel?: string;
  signature?: string;
  chunkId?: string | undefined;
  [k: string]: any;
}

export interface FacetCandidate {
  name: string;
  functions: any[];
  estimatedSize?: number;
  category?: string;
  dependencies?: any[];
  storageRequirements?: any[];
  [k: string]: any;
}

export interface ParsedContract {
  name?: string;
  functions?: FunctionInfo[];
  variables?: VariableInfo[];
  events?: EventInfo[];
  runtimeCodehash?: string;
  deploymentStrategy?: string;
  chunkingRequired?: boolean;
  facetCandidates?: Map<string, any> | Record<string, any>;
  storageCollisions?: string[];
  manifestRoutes?: ManifestRoute[];
  imports?: any[];
  inheritance?: any[];
  modifiers?: any[];
  totalSize?: number;
  [k: string]: any;
}

export default {};
