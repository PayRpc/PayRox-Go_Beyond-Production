export interface FunctionInfo {
	name: string;
	signature: string;
	selector?: string;
	size: number;
	gasEstimate: number;
	securityLevel?: string;
	stateMutability?: string;
	visibility?: string;
	modifiers: string[];
	dependencies: string[];
	parameters?: ParameterInfo[];
	isConstructor?: boolean;
	returnParameters?: ParameterInfo[];
	isReceiveEther?: boolean;
	isFallback?: boolean;
}

export interface VariableInfo {
	name: string;
	type: string;
	size: number;
	slot: number;
	offset: number;
	visibility?: string;
	isDeclaredConst?: boolean;
	expression?: any;
	isConstant?: boolean;
	dependencies?: string[];
}

export interface EventInfo {
	name: string;
	signature?: string;
	inputs?: any[];
	parameters?: ParameterInfo[];
	indexed?: boolean;
}

export interface ModifierInfo {
	name: string;
	parameters?: ParameterInfo[];
	dependencies?: string[];
}

export interface ImportInfo {
	path: string;
	symbols?: string[];
}

export interface ParameterInfo {
	name?: string;
	type?: string;
	storageLocation?: string;
}

export interface ChunkInfo {
	id: number;
	name: string;
	functions: FunctionInfo[];
	variables: VariableInfo[];
	size: number;
	gasEstimate: number;
	dependencies: string[];
	deploymentAddress?: string;
}

export interface FacetCandidate {
	name: string;
	functions: FunctionInfo[];
	size?: number;
	gasEstimate?: number;
	securityLevel?: string;
}

export class AnalysisError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "AnalysisError";
	}
}

export interface ManifestRoute {
	selector?: string;
	facetAddress?: string;
	functionSignature?: string;
}

export interface ParsedContract {
	name: string;
	sourceCode?: string;
	ast?: any;
	compiled?: any;
	functions: FunctionInfo[];
	variables: VariableInfo[];
	events: EventInfo[];
	modifiers?: ModifierInfo[];
	imports?: ImportInfo[];
	inheritance?: any;
	totalSize: number;
	deploymentStrategy: string;
	storageLayout?: any;
	manifestRoutes?: ManifestRoute[];
	securityAnalysis?: { riskScore?: number; vulnerabilities?: string[]; recommendations?: string[] };
	chunkingRequired?: boolean;
	facetCandidates?: Map<string, FunctionInfo[]>;
	storageCollisions?: string[];
}

export interface SourceLocation {
	start: number;
	end: number;
}

export interface StorageSlot {
	slot: number;
	offset: number;
	name: string;
	type?: string;
}

export interface CompilationError {
	message: string;
	severity?: string;
}
