export type SourceLocation =
  | { start: number, end: number, line?: number, column?: number }
  | {
    start: { line: number, column: number }
    end: { line: number, column: number }
  }

export interface ParameterInfo { name: string, type: string, indexed?: boolean }
export interface VariableInfo {
  name: string
  type: string
  visibility?: string
  constant?: boolean
  immutable?: boolean
  slot: number
  offset: number
  size: number
  dependencies?: string[]
  sourceLocation?: SourceLocation
}
export interface FunctionInfo {
  name: string
  selector: string
  signature: string
  visibility: string
  stateMutability: string
  parameters: ParameterInfo[]
  returnParameters: ParameterInfo[]
  modifiers: string[]
  gasEstimate: number
  dependencies: string[]
  codeSize: number
  sourceLocation: SourceLocation
}
export interface EventInfo {
  name: string
  signature: string
  parameters: ParameterInfo[]
  indexed: boolean[]
  sourceLocation: SourceLocation
}
export interface ModifierInfo {
  name: string
  parameters: ParameterInfo[]
  sourceLocation: SourceLocation
}
export interface ImportInfo {
  path: string
  symbols: string[]
  sourceLocation?: SourceLocation
}
export interface StorageSlot {
  slot: number
  offset?: number
  size?: number
  type?: string
  variable?: string
  contract?: string
}
export interface ManifestRoute {
  name: string
  path: string
  selector: string
  facet?: string
  codehash?: string
  functionName?: string
  gasEstimate?: number
  securityLevel?: string
  signature?: string
  chunkId?: string
}
export interface FacetCandidate {
  name: string
  functions: FunctionInfo[]
  estimatedSize: number
  category?: string
  dependencies?: string[]
  storageRequirements?: string[]
}
export interface ParsedContract {
  name: string
  sourceCode: string
  ast?: any
  functions: FunctionInfo[]
  variables: VariableInfo[]
  events: EventInfo[]
  modifiers: ModifierInfo[]
  imports: ImportInfo[]
  inheritance: string[]
  totalSize: number
  storageLayout: StorageSlot[]
  facetCandidates: Map<string, FunctionInfo[]>
  manifestRoutes: ManifestRoute[]
  chunkingRequired: boolean
  runtimeCodehash?: string
  storageCollisions: string[]
  deploymentStrategy: string
}

export class CompilationError extends Error {
  errors: any[]
  constructor (message: string, errors?: any[]) {
    super(message)
    this.errors = errors || []
  }
}

export class AnalysisError extends Error {}
