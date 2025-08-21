/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse } from "@solidity-parser/parser";
import * as solc from "solc";
import { keccak256 } from "ethers";
import * as crypto from "crypto";
import { Command } from "commander";
import * as fs from "fs";
import {
  ParsedContract,
  FunctionInfo,
  VariableInfo,
  EventInfo,
  ModifierInfo,
  ImportInfo,
  ParameterInfo,
  ChunkInfo,
  FacetCandidate,
  AnalysisError,
  ManifestRoute,
} from "./types";

// ===============================================
// Core AST Node Type Definitions
// ===============================================

interface ASTNode {
  type: string;
  range?: [number, number];
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  parent?: ASTNode;
  [key: string]: any;
}

interface ContractNode extends ASTNode {
  type: "ContractStatement";
  name: string;
  baseContracts?: Array<{
    baseName: { namePath: string };
  }>;
  body?: ASTNode[];
}

interface FunctionNode extends ASTNode {
  type: "FunctionDefinition";
  name?: string;
  parameters?: ParameterListNode;
  returnParameters?: ParameterListNode;
  modifiers?: Array<{ name: string }>;
  stateMutability?: string;
  visibility?: string;
  isConstructor?: boolean;
  isReceiveEther?: boolean;
  isFallback?: boolean;
  body?: ASTNode;
}

interface ParameterListNode extends ASTNode {
  type: "ParameterList";
  parameters: Array<{
    typeName: ASTNode;
    name?: string;
    storageLocation?: string;
  }>;
}

interface EventNode extends ASTNode {
  type: "EventDefinition";
  name: string;
  parameters?: ParameterListNode;
}

interface VariableNode extends ASTNode {
  type: "StateVariableDeclaration";
  variables: Array<{
    name: string;
    typeName: ASTNode;
    visibility?: string;
    isDeclaredConst?: boolean;
    expression?: ASTNode;
  }>;
}

interface _ModifierDefinitionNode extends ASTNode {
  type: "ModifierDefinition";
  name: string;
  parameters?: ParameterListNode;
  body?: ASTNode;
}

// Note: CompilationOutput interface removed as it was unused
// It was only needed for solc compilation output typing

// Canonical zero hash (256-bit)
const ZERO_HASH = "0x" + "0".repeat(64);

export class SolidityAnalyzer {
  constructor() {
    // Initialize analyzer
  }

  // ===============================================
  // Primary Analysis Entry Points
  // ===============================================

  async parseContract(
    sourceCode: string,
    contractName?: string,
  ): Promise<ParsedContract> {
    try {
      // Parse AST first
      const ast = parse(sourceCode, {
        range: false,
        loc: true,
        tolerant: true,
      });

      // Compile contract for additional information
      let compiled: any = {};
      try {
        compiled = await this.compileContract(sourceCode, contractName);
      } catch (e) {
        console.warn(
          "Compilation failed, continuing with AST-only analysis:",
          e instanceof Error ? e.message : e,
        );
        compiled = {};
      }

      // Extract contract information
      const contractNode = this.findContractNode(ast, contractName);
      if (!contractNode) {
        throw new AnalysisError("Contract not found in source code");
      }

      // Extract all components
      const functions = this.extractFunctions(contractNode, sourceCode);
      const variables = this.extractVariables(contractNode, sourceCode);
      const events = this.extractEvents(contractNode, sourceCode);
      const modifiers = this.extractModifiersFromContract(
        contractNode,
        sourceCode,
      );
      const imports = this.extractImports(ast);
      const inheritance = this.extractInheritance(contractNode);

      // Calculate metrics
      const totalSize = this.calculateTotalSize(functions, variables);
      const deploymentStrategy = this.determineDeploymentStrategy(
        totalSize,
        functions.length,
      );

      // Analyze storage layout
      const storageLayout = this.analyzeStorageLayout(variables, compiled);

      // Create diamond-compatible manifest routes
      const manifestRoutes = this.generateManifestRoutes(functions, compiled);

      // Generate security analysis
      const securityAnalysis = this.performSecurityAnalysis(
        functions,
        variables,
      );

      const result: ParsedContract = {
        name: contractNode.name,
        sourceCode,
        ast,
        compiled,
        functions,
        variables,
        events,
        modifiers,
        imports,
        inheritance,
        totalSize,
        deploymentStrategy,
        storageLayout,
        manifestRoutes,
        securityAnalysis,
        chunkingRequired:
          deploymentStrategy === "chunked" || deploymentStrategy === "faceted",
        facetCandidates:
          deploymentStrategy === "faceted"
            ? this.identifyFacetCandidates(functions)
            : new Map(),
        storageCollisions: storageLayout.collisions || [],
      };

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new AnalysisError(`Failed to parse contract: ${errorMessage}`);
    }
  }

  private async compileContract(
    sourceCode: string,
    _contractName?: string,
  ): Promise<any> {
    try {
      const input = {
        language: "Solidity",
        sources: {
          "contract.sol": {
            content: sourceCode,
          },
        },
        settings: {
          outputSelection: {
            "*": {
              "*": [
                "abi",
                "evm.bytecode",
                "evm.deployedBytecode",
                "evm.gasEstimates",
                "storageLayout",
              ],
            },
          },
        },
      };

      const output = JSON.parse(solc.compile(JSON.stringify(input)));

      if (output.errors) {
        const errors = output.errors.filter(
          (err: { severity: string }) => err.severity === "error",
        );
        if (errors.length > 0) {
          throw new Error(`Compilation failed: ${errors[0].message}`);
        }
      }

      return output.contracts?.["contract.sol"] || {};
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new AnalysisError(`Compilation failed: ${errorMessage}`);
    }
  }

  private findContractNode(
    ast: unknown,
    contractName?: string,
  ): ContractNode | null {
    const contractNodes: ContractNode[] = [];

    this.visitNode(ast as ASTNode, (node) => {
      if (node.type === "ContractStatement") {
        contractNodes.push(node as ContractNode);
      }
    });

    if (contractName) {
      const found = contractNodes.find((node) => node.name === contractName);
      return found || null;
    }

    return contractNodes[0] || null;
  }

  // ===============================================
  // Contract Component Extraction
  // ===============================================

  private extractFunctions(
    contractNode: ContractNode,
    sourceCode: string,
  ): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    this.visitNode(contractNode, (node) => {
      if (node.type === "FunctionDefinition") {
        const functionNode = node as FunctionNode;
        functions.push({
          name:
            functionNode.name ||
            (functionNode.isConstructor ? "constructor" : "fallback"),
          parameters: this.extractParameters(functionNode.parameters),
          returnParameters: this.extractParameters(
            functionNode.returnParameters,
          ),
          modifiers: this.extractModifiers(functionNode),
          stateMutability: functionNode.stateMutability || "nonpayable",
          visibility: functionNode.visibility || "internal",
          isConstructor: functionNode.isConstructor || false,
          isReceiveEther: functionNode.isReceiveEther || false,
          isFallback: functionNode.isFallback || false,
          signature: this.buildFunctionSignature(functionNode),
          selector: this.calculateSelector(functionNode),
          dependencies: this.findFunctionDependencies(functionNode, sourceCode),
          size: this.estimateFunctionSize(functionNode),
          gasEstimate: this.estimateFunctionGas(functionNode),
          securityLevel: this.assessSecurityLevel({
            name: functionNode.name || "fallback",
            stateMutability: functionNode.stateMutability || "nonpayable",
            visibility: functionNode.visibility || "internal",
            modifiers: this.extractModifiers(functionNode),
          } as FunctionInfo),
        });
      }
    });

    return functions;
  }

  private extractVariables(
    contractNode: ContractNode,
    sourceCode: string,
  ): VariableInfo[] {
    const variables: VariableInfo[] = [];

    this.visitNode(contractNode, (node) => {
      if (node.type === "StateVariableDeclaration") {
        const variableNode = node as VariableNode;
        if (variableNode.variables) {
          for (const variable of variableNode.variables) {
            variables.push({
              name: variable.name,
              type: this.typeToString(variable.typeName),
              visibility: variable.visibility || "internal",
              isConstant: variable.isDeclaredConst || false,
              dependencies: this.findVariableDependencies(variable, sourceCode),
              size: this.estimateVariableSize(variable.typeName),
              slot: -1, // Will be calculated later
              offset: 0,
            });
          }
        }
      }
    });

    return variables;
  }

  private extractEvents(
    contractNode: ContractNode,
    _sourceCode: string,
  ): EventInfo[] {
    const events: EventInfo[] = [];

    this.visitNode(contractNode, (node) => {
      if (node.type === "EventDefinition") {
        const eventNode = node as EventNode;
        events.push({
          name: eventNode.name,
          parameters: this.extractParameters(eventNode.parameters),
          signature: this.buildEventSignature(eventNode),
          indexed:
            (node as any).parameters?.map?.(
              (param: any) => param.isIndexed || false,
            ) || [],
        });
      }
    });

    return events;
  }

  private extractModifiersFromContract(
    contractNode: any,
    sourceCode: string,
  ): ModifierInfo[] {
    const modifiers: ModifierInfo[] = [];

    this.visitNode(contractNode, (node) => {
      if (node.type === "ModifierDefinition") {
        modifiers.push({
          name: node.name,
          parameters: this.extractParameters(node.parameters),
          dependencies: this.findFunctionDependencies(node, sourceCode),
        });
      }
    });

    return modifiers;
  }

  private extractImports(ast: ASTNode): ImportInfo[] {
    const imports: ImportInfo[] = [];

    this.visitNode(ast, (node) => {
      if (node.type === "ImportDirective") {
        imports.push({
          path: (node as any).path,
          symbols:
            (node as any).symbolAliases?.map?.((alias: any) => alias.foreign) ||
            [],
        });
      }
    });

    return imports;
  }

  private extractInheritance(contractNode: ContractNode): string[] {
    return (
      contractNode.baseContracts?.map((base: any) => base.baseName.namePath) ||
      []
    );
  }

  // ===============================================
  // Signature and Selector Generation
  // ===============================================

  private calculateSelector(functionNode: FunctionNode): string {
    const signature = this.buildFunctionSignature(functionNode);
    return this.selectorFromSignature(signature);
  }

  private selectorFromSignature(signature: string): string {
    return keccak256(Buffer.from(signature, "utf8")).slice(0, 10);
  }

  /**
   * Build function signature for function identification
   */
  private buildFunctionSignature(functionNode: FunctionNode): string {
    if (!functionNode.name || functionNode.isConstructor) {
      return "constructor";
    }

    const params =
      functionNode.parameters?.parameters
        ?.map((param: any) => {
          if (param.typeName) {
            return this.typeToString(param.typeName);
          }
          // Fallback: if no typeName, check if this is a stub with type
          return param.type || "unknown";
        })
        .join(",") || "";

    return `${functionNode.name}(${params})`;
  }

  /**
   * Build event signature string
   */
  private buildEventSignature(eventNode: EventNode): string {
    const params =
      eventNode.parameters?.parameters
        ?.map((param) => this.typeToString(param.typeName))
        .join(",") || "";
    return `${eventNode.name}(${params})`;
  }

  private extractParameters(
    parameterList: ParameterListNode | undefined,
  ): ParameterInfo[] {
    if (!parameterList || !parameterList.parameters) {
      return [];
    }

    return parameterList.parameters.map((param) => ({
      name: param.name || "",
      type: this.typeToString(param.typeName),
      storageLocation: param.storageLocation,
    }));
  }

  private extractModifiers(functionNode: FunctionNode): string[] {
    return functionNode.modifiers?.map((modifier) => modifier.name) || [];
  }

  // ===============================================
  // Type System Utilities
  // ===============================================

  private typeToString(typeNode: ASTNode): string {
    if (!typeNode) return "unknown";

    switch (typeNode.type) {
      case "ElementaryTypeName":
        return (typeNode as any).name || "unknown";

      case "UserDefinedTypeName":
        return (typeNode as any).namePath || "unknown";

      case "ArrayTypeName": {
        const baseType = this.typeToString((typeNode as any).baseTypeName);
        const length = (typeNode as any).length;
        return length ? `${baseType}[${length}]` : `${baseType}[]`;
      }

      case "MappingTypeName": {
        const keyType = typeNode.keyType
          ? this.typeToString(typeNode.keyType)
          : "unknown";
        const valueType = typeNode.valueType
          ? this.typeToString(typeNode.valueType)
          : "unknown";
        return `mapping(${keyType} => ${valueType})`;
      }

      case "Mapping": {
        const keyType2 = typeNode.keyType
          ? this.typeToString(typeNode.keyType)
          : "unknown";
        const valueType2 = typeNode.valueType
          ? this.typeToString(typeNode.valueType)
          : "unknown";
        return `mapping(${keyType2} => ${valueType2})`;
      }

      case "FunctionTypeName":
        return "function";

      default:
        return (typeNode as any).name || typeNode.type || "unknown";
    }
  }

  // ===============================================
  // Size and Gas Estimation
  // ===============================================

  private estimateFunctionSize(functionNode: FunctionNode): number {
    if (!functionNode.body) return 0;

    // Try to get size from range if available
    if (functionNode.range && functionNode.range[1] > functionNode.range[0]) {
      return functionNode.range[1] - functionNode.range[0];
    }

    // Fallback: estimate based on line count when ranges are disabled
    if (functionNode.loc) {
      const lineCount =
        functionNode.loc.end.line - functionNode.loc.start.line + 1;
      return lineCount * 50; // Estimate ~50 chars per line
    }

    // Final fallback: basic node counting
    let nodeCount = 0;
    this.visitNode(functionNode.body, () => {
      nodeCount++;
    });
    return nodeCount * 10; // Rough estimate
  }

  private estimateVariableSize(typeNode: ASTNode): number {
    const typeString = this.typeToString(typeNode);

    // Basic type size estimation
    if (typeString.includes("uint256") || typeString.includes("int256"))
      return 32;
    if (typeString.includes("address")) return 20;
    if (typeString.includes("bool")) return 1;
    if (typeString.includes("bytes32")) return 32;
    if (typeString.includes("string")) return 64; // Dynamic, estimate
    if (typeString.includes("mapping")) return 32; // Slot reference

    return 32; // Default slot size
  }

  /**
   * Estimate function gas usage
   */
  private estimateFunctionGas(functionNode: any): number {
    let gasEstimate = 21000; // Base transaction cost

    // Add gas for function complexity
    if (functionNode.body) {
      gasEstimate += this.estimateBlockGas(functionNode.body) * 1000;
    }

    // Add gas for modifiers
    gasEstimate += (functionNode.modifiers?.length || 0) * 5000;

    // Add gas for state mutability
    if (
      functionNode.stateMutability === "view" ||
      functionNode.stateMutability === "pure"
    ) {
      gasEstimate = Math.min(gasEstimate, 10000);
    } else if (functionNode.stateMutability === "payable") {
      gasEstimate += 10000;
    }

    return gasEstimate;
  }

  private findFunctionDependencies(
    functionNode: any,
    _sourceCode: string,
  ): string[] {
    const dependencies = new Set<string>();

    this.visitNode(functionNode, (node) => {
      if (node.type === "FunctionCall") {
        // Fixed: Use expression-based call detection
        if (node.expression?.name) {
          dependencies.add(node.expression.name);
        } else if (node.expression?.memberName) {
          dependencies.add(node.expression.memberName);
        }
      }
    });

    return Array.from(dependencies);
  }

  private findVariableDependencies(
    variableNode: any,
    _sourceCode: string,
  ): string[] {
    const dependencies = new Set<string>();

    if (variableNode.expression) {
      this.visitNode(variableNode.expression, (node) => {
        if (node.type === "Identifier") {
          dependencies.add(node.name);
        }
      });
    }

    return Array.from(dependencies);
  }

  private calculateTotalSize(
    functions: FunctionInfo[],
    variables: VariableInfo[],
  ): number {
    const functionSize = functions.reduce((sum, fn) => sum + fn.size, 0);
    const variableSize = variables.reduce(
      (sum, variable) => sum + variable.size,
      0,
    );
    return functionSize + variableSize;
  }

  // ===============================================
  // Storage Layout Analysis
  // ===============================================

  private analyzeStorageLayout(variables: VariableInfo[], _compiled: any): any {
    const layout = {
      variables: variables.map((v, index) => ({
        ...v,
        slot: index,
        offset: 0,
      })),
      collisions: this.detectStorageCollisions(variables),
      isDiamondCompliant: this.checkDiamondStorageCompliance(variables),
    };

    return layout;
  }

  private detectStorageCollisions(variables: VariableInfo[]): string[] {
    const collisions: string[] = [];
    const slotMap = new Map<number, string[]>();

    // Group variables by slot
    variables.forEach((v) => {
      if (!slotMap.has(v.slot)) {
        slotMap.set(v.slot, []);
      }
      slotMap.get(v.slot)!.push(v.name);
    });

    // Check for collisions
    slotMap.forEach((vars, slot) => {
      if (vars.length > 1) {
        collisions.push(
          `Potential storage collision at slot ${slot}: ${vars.join(", ")}`,
        );
      }
    });

    if (!this.checkDiamondStorageCompliance(variables)) {
      collisions.push(
        "Contract may not be diamond storage compliant - consider using diamond storage pattern",
      );
    }

    return collisions;
  }

  private checkDiamondStorageCompliance(variables: VariableInfo[]): boolean {
    // Check for diamond storage pattern usage
    const hasStorageStruct = variables.some(
      (v) =>
        v.name.toLowerCase().includes("storage") ||
        v.type.toLowerCase().includes("storage"),
    );

    const hasProperIsolation = variables.every(
      (v) => v.slot >= 0 && v.offset >= 0,
    );

    return hasStorageStruct && hasProperIsolation;
  }

  private determineDeploymentStrategy(
    totalSize: number,
    functionCount: number,
  ): string {
    const SIZE_THRESHOLD = 24576; // 24KB contract size limit
    const FUNCTION_THRESHOLD = 20; // Reasonable function count for single contract

    if (totalSize <= SIZE_THRESHOLD && functionCount <= FUNCTION_THRESHOLD) {
      return "monolithic";
    } else if (
      totalSize > SIZE_THRESHOLD ||
      functionCount > FUNCTION_THRESHOLD
    ) {
      return "faceted";
    } else {
      return "chunked";
    }
  }

  // ===============================================
  // Facet Analysis and Recommendations
  // ===============================================

  private generateFacetRecommendations(
    _functions: FunctionInfo[],
  ): FacetCandidate[] {
    const _facetRecommendations: FacetCandidate[] = [];

    return (contract.functions || []).map((fn) => ({
      name: `${contract.name}_${fn.name}`,
      functions: [fn],
      size: fn.size,
      gasEstimate: fn.gasEstimate,
      securityLevel: fn.securityLevel,
    }));
  }

  private identifyFacetCandidates(
    functions: FunctionInfo[],
  ): Map<string, FunctionInfo[]> {
    const facets = new Map<string, FunctionInfo[]>();

    for (const fn of functions) {
      let facetName = "core";

      if (this.isAccessControlFunction(fn)) {
        facetName = "access";
      } else if (
        fn.stateMutability === "view" ||
        fn.stateMutability === "pure"
      ) {
        facetName = "view";
      } else if (this.isGovernanceFunction(fn)) {
        facetName = "governance";
      } else if (fn.stateMutability === "payable") {
        facetName = "payment";
      }

      if (!facets.has(facetName)) {
        facets.set(facetName, []);
      }
      facets.get(facetName)!.push(fn);
    }

    return facets;
  }

  private isAccessControlFunction(func: FunctionInfo): boolean {
    const adminPatterns = [
      /^set[A-Z]/,
      /^update[A-Z]/,
      /^change[A-Z]/,
      /^grant[A-Z]/,
      /^revoke[A-Z]/,
      /admin/i,
      /owner/i,
    ];

    return (
      adminPatterns.some((pattern) => pattern.test(func.name)) ||
      (func.modifiers || []).some((mod) => /owner|admin|auth|role/i.test(mod))
    );
  }

  private isGovernanceFunction(func: FunctionInfo): boolean {
    const governancePatterns = [
      /^propose/i,
      /^vote/i,
      /^execute/i,
      /^queue/i,
      /governance/i,
      /proposal/i,
    ];

    return governancePatterns.some((pattern) => pattern.test(func.name));
  }

  // ===============================================
  // Security Analysis
  // ===============================================

  private performSecurityAnalysis(
    functions: FunctionInfo[],
    variables: VariableInfo[],
  ): any {
    return {
      vulnerabilities: this.detectVulnerabilities(functions, variables),
      recommendations: this.generateSecurityRecommendations(
        functions,
        variables,
      ),
      riskScore: this.calculateRiskScore(functions, variables),
    };
  }

  private detectVulnerabilities(
    functions: FunctionInfo[],
    _variables: VariableInfo[],
  ): string[] {
    const vulnerabilities: string[] = [];

    // Check for reentrancy patterns
    const payableFunctions = functions.filter(
      (f) => f.stateMutability === "payable",
    );
    if (payableFunctions.length > 0) {
      vulnerabilities.push("Potential reentrancy risk in payable functions");
    }

    // Check for unprotected state changes
    const unprotectedFunctions = functions.filter(
      (f) =>
        f.visibility === "public" &&
        f.stateMutability !== "view" &&
        f.modifiers.length === 0,
    );
    if (unprotectedFunctions.length > 0) {
      vulnerabilities.push(
        "Unprotected public state-changing functions detected",
      );
    }

    return vulnerabilities;
  }

  private generateSecurityRecommendations(
    functions: FunctionInfo[],
    variables: VariableInfo[],
  ): string[] {
    const recommendations: string[] = [];

    // Recommend access control
    const publicFunctions = functions.filter((f) => f.visibility === "public");
    if (publicFunctions.length > 5) {
      recommendations.push("Consider implementing role-based access control");
    }

    // Recommend diamond storage
    if (variables.length > 10) {
      recommendations.push(
        "Consider using diamond storage pattern for better upgradability",
      );
    }

    return recommendations;
  }

  private calculateRiskScore(
    functions: FunctionInfo[],
    variables: VariableInfo[],
  ): number {
    let score = 0;

    // Risk factors
    score +=
      functions.filter((f) => f.stateMutability === "payable").length * 10;
    score +=
      functions.filter(
        (f) => f.visibility === "public" && f.modifiers.length === 0,
      ).length * 5;
    score += variables.filter((v) => v.visibility === "public").length * 3;

    return Math.min(score, 100); // Cap at 100
  }

  private generateManifestRoutes(
    functions: FunctionInfo[],
    _compiled: any,
  ): ManifestRoute[] {
    const routes: ManifestRoute[] = [];

    for (const func of functions) {
      if (func.visibility === "public" || func.visibility === "external") {
        routes.push({
          selector: func.selector,
          facetAddress: "0x0000000000000000000000000000000000000000", // Placeholder
          functionSignature: func.signature,
        });
      }
    }

    return routes;
  }

  private assessSecurityLevel(
    func: FunctionInfo,
  ): "low" | "medium" | "high" | "critical" {
    let score = 0;

    // Risk factors
    if (func.stateMutability === "payable") score += 3;
    if (func.visibility === "public") score += 2;
    if (func.modifiers.length === 0) score += 2;
    if (this.isAccessControlFunction(func)) score += 1;

    if (score >= 6) return "critical";
    if (score >= 4) return "high";
    if (score >= 2) return "medium";
    return "low";
  }

  // ===============================================
  // Chunking and Deployment Optimization
  // ===============================================

  async generateOptimizedChunks(
    contract: ParsedContract,
  ): Promise<ChunkInfo[]> {
    if (!contract.chunkingRequired) {
      return [
        {
          id: 0,
          name: `${contract.name}_Full`,
          functions: contract.functions,
          variables: contract.variables,
          size: contract.totalSize,
          gasEstimate: contract.functions.reduce(
            (sum, f) => sum + f.gasEstimate,
            0,
          ),
          dependencies: [],
          deploymentAddress: "",
        },
      ];
    }

    return this.createOptimizedChunks(contract);
  }

  private createOptimizedChunks(contract: ParsedContract): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];
    const maxChunkSize = 20000; // Conservative size limit

    // Group functions by feature/access pattern
    const featureGroups = this.groupFunctionsByFeature(contract.functions);

    for (const [feature, funcs] of Array.from(featureGroups.entries())) {
      let currentChunk: any = this.createEmptyChunk(chunks.length, feature);

      for (const func of funcs) {
        if (currentChunk.size + func.size > maxChunkSize) {
          // Finalize current chunk
          chunks.push(currentChunk);
          currentChunk = this.createEmptyChunk(chunks.length, feature);
        }

        currentChunk.functions.push(func);
        currentChunk.size += func.size;
        currentChunk.gasEstimate += func.gasEstimate;
        currentChunk.dependencies.push(...func.dependencies);
      }

      if (currentChunk.functions.length > 0) {
        chunks.push(currentChunk);
      }
    }

    return this.optimizeChunkDependencies(chunks);
  }

  private groupFunctionsByFeature(
    functions: FunctionInfo[],
  ): Map<string, FunctionInfo[]> {
    const groups = new Map<string, FunctionInfo[]>();

    for (const func of functions) {
      let feature = "core";

      if (this.isAccessControlFunction(func)) {
        feature = "access";
      } else if (
        func.stateMutability === "view" ||
        func.stateMutability === "pure"
      ) {
        feature = "view";
      } else if (this.isGovernanceFunction(func)) {
        feature = "governance";
      }

      if (!groups.has(feature)) {
        groups.set(feature, []);
      }
      groups.get(feature)!.push(func);
    }

    return groups;
  }

  private createEmptyChunk(id: number, feature: string): ChunkInfo {
    return {
      id,
      name: `Chunk_${id}_${feature}`,
      functions: [],
      variables: [],
      size: 0,
      gasEstimate: 0,
      dependencies: [],
      deploymentAddress: "",
    };
  }

  private optimizeChunkDependencies(chunks: ChunkInfo[]): ChunkInfo[] {
    // Analyze cross-chunk dependencies and optimize deployment order
    const dependencyGraph = this.buildDependencyGraph(chunks);
    return this.reorderChunksByDependencies(chunks, dependencyGraph);
  }

  private buildDependencyGraph(chunks: ChunkInfo[]): Map<number, number[]> {
    const graph = new Map<number, number[]>();

    for (let i = 0; i < chunks.length; i++) {
      graph.set(i, []);

      for (let j = 0; j < chunks.length; j++) {
        if (i === j) continue;

        const chunk1Deps = new Set(chunks[i].dependencies);
        const chunk2Funcs = new Set(
          chunks[j].functions.map((f: any) => f.name),
        );

        // Count dependencies from chunk1 to chunk2
        for (const dep of Array.from(chunk1Deps)) {
          if (chunk2Funcs.has(dep)) {
            graph.get(i)!.push(j);
            break;
          }
        }
      }
    }

    return graph;
  }

  private reorderChunksByDependencies(
    chunks: ChunkInfo[],
    _dependencyGraph: Map<number, number[]>,
  ): ChunkInfo[] {
    // Simple topological sort for deployment order
    // For now, return chunks as-is, but this could be enhanced
    return chunks;
  }

  // ===============================================
  // Merkle Tree Operations
  // ===============================================

  /**
   * Calculate merkle root from hashes
   */
  private calculateMerkleRoot(hashes: string[]): string {
    if (!hashes || hashes.length === 0) {
      return ZERO_HASH;
    }
    if (hashes.length === 1) {
      return hashes[0] || ZERO_HASH;
    }

    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i] ?? hashes[i - 1];
      const right = hashes[i + 1] ?? left;

      // Convert hex strings to bytes for proper hashing
      const leftBytes = Buffer?.from(left?.replace(/^0x/, ""), "hex");
      const rightBytes = Buffer?.from(right?.replace(/^0x/, ""), "hex");
      const combined = Buffer.concat([leftBytes, rightBytes]);
      const hash = crypto.createHash("sha256").update(combined).digest("hex");

      nextLevel.push("0x" + hash);
    }

    return this.calculateMerkleRoot(nextLevel);
  }

  private buildFunctionMerkleTree(functions: FunctionInfo[]): any {
    const hashes = functions.map((fn) =>
      keccak256(Buffer.from(fn.signature, "utf8")),
    );
    return {
      root: this.calculateMerkleRoot(hashes),
      leaves: hashes,
      functions: functions.map((fn) => fn.signature),
    };
  }

  // ===============================================
  // Gas and Size Optimization
  // ===============================================

  /**
   * Estimate gas usage for a code block
   */
  private estimateBlockGas(blockNode: any): number {
    let gasEstimate = 0;

    this.visitNode(blockNode, (node) => {
      switch (node.type) {
        case "Assignment": // Correct AST node type
        case "AssignmentOperator":
          gasEstimate += 5; // SSTORE cost
          break;
        case "FunctionCall":
          gasEstimate += 3; // CALL cost
          break;
        case "IfStatement":
          gasEstimate += 1; // JUMPI cost
          break;
        case "ForStatement":
        case "WhileStatement":
          gasEstimate += 10; // Loop overhead
          break;
        case "BinaryOperation":
          gasEstimate += 0.5; // Mathematical operations
          break;
        case "UnaryOperation":
          gasEstimate += 0.3; // Unary operations
          break;
        default:
          gasEstimate += 0.1; // Basic operations
      }
    });

    return gasEstimate;
  }

  /**
   * Get source location information
   */
  private getSourceLocation(
    node: ASTNode,
  ): { start: number; end: number } | null {
    if (node.range) {
      return { start: node.range[0], end: node.range[1] };
    }
    return null;
  }

  // ===============================================
  // Utilities and Helpers
  // ===============================================

  /**
   * Generic AST node visitor
   */
  private visitNode(_node: ASTNode, callback: (_node: ASTNode) => void): void {
    if (!_node) {
      return;
    }

    callback(_node);

    // Visit child nodes
    for (const [key, value] of Object.entries(_node)) {
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (typeof child === "object" && child !== null) {
            this.visitNode(child as ASTNode, callback);
          }
        });
      } else if (
        typeof value === "object" &&
        value !== null &&
        key !== "parent"
      ) {
        this.visitNode(value as ASTNode, callback);
      }
    }
  }

  // ===============================================
  // PayRox Go Beyond Specific Methods
  // ===============================================

  /**
   * Calculate SHA256 hash for merkle operations
   */
  private calculateSHA256(data: string): string {
    return "0x" + crypto.createHash("sha256").update(data, "hex").digest("hex");
  }

  /**
   * Generate dependency graph for functions
   */
  generateDependencyGraph(functions: FunctionInfo[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const func of functions || []) {
      for (const dep of func.dependencies || []) {
        if (!graph.has(func.name)) {
          graph.set(func.name, []);
        }
        graph.get(func.name)!.push(dep);
      }
    }

    return graph;
  }

  /**
   * Detect circular dependencies in function calls
   */
  detectCircularDependencies(functions: FunctionInfo[]): string[] {
    const graph = this.generateDependencyGraph(functions);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycles: string[] = [];

    const dfs = (node: string, path: string[]): void => {
      if (visiting.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push(
          `Circular dependency: ${path.slice(cycleStart).join(" -> ")} -> ${node}`,
        );
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visiting.add(node);
      const dependencies = graph.get(node) || [];

      for (const dep of dependencies) {
        dfs(dep, [...path, node]);
      }

      visiting.delete(node);
      visited.add(node);
    };

    for (const func of functions) {
      if (!visited.has(func.name)) {
        dfs(func.name, []);
      }
    }

    return cycles;
  }

  /**
   * Advanced chunking with dependency resolution
   */
  async generateDependencyAwareChunks(
    contract: ParsedContract,
  ): Promise<ChunkInfo[]> {
    const cycles = this.detectCircularDependencies(contract.functions);
    if (cycles.length > 0) {
      console.warn("Circular dependencies detected:", cycles);
    }

    return this.createOptimizedChunks(contract);
  }

  /**
   * Generate comprehensive analysis report
   */
  async generateAnalysisReport(contract: ParsedContract): Promise<any> {
    const chunks = await this.generateOptimizedChunks(contract);
    const merkleTree = this.buildFunctionMerkleTree(contract.functions);
    const dependencyGraph = this.generateDependencyGraph(contract.functions);
    const circularDeps = this.detectCircularDependencies(contract.functions);

    return {
      contract: {
        name: contract.name,
        totalSize: contract.totalSize,
        deploymentStrategy: contract.deploymentStrategy,
        chunkingRequired: contract.chunkingRequired,
        functionCount: contract.functions.length,
        variableCount: contract.variables.length,
        eventCount: contract.events.length,
      },
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        name: chunk.name,
        functionCount: chunk.functions.length,
        size: chunk.size,
        gasEstimate: chunk.gasEstimate,
        dependencies: chunk.dependencies.length,
      })),
      security: {
        riskScore: contract.securityAnalysis?.riskScore || 0,
        vulnerabilities: contract.securityAnalysis?.vulnerabilities || [],
        recommendations: contract.securityAnalysis?.recommendations || [],
      },
      optimization: {
        merkleRoot: merkleTree.root,
        dependencyComplexity: dependencyGraph.size,
        circularDependencies: circularDeps,
        storageCollisions: contract.storageCollisions?.length || 0,
      },
      facets: Array.from(contract.facetCandidates?.entries() || []).map(
        ([name, funcs]) => ({
          name,
          functionCount: funcs.length,
          totalSize: funcs.reduce((sum, f) => sum + f.size, 0),
        }),
      ),
    };
  }

  /**
   * Generate PayRox-compatible manifest
   */
  generateManifest(contract: ParsedContract, chunks: ChunkInfo[]): any {
    const facetRecommendations: FacetCandidate[] = [];

    return {
      name: contract.name,
      version: "1.0.0",
      description: `Auto-generated manifest for ${contract.name}`,
      deployment: {
        strategy: contract.deploymentStrategy,
        chunks: chunks.map((chunk) => ({
          id: chunk.id,
          name: chunk.name,
          size: chunk.size,
          functions: chunk.functions.map((f) => f.signature),
          gasEstimate: chunk.gasEstimate,
        })),
      },
      diamond: {
        facets: Array.from(contract.facetCandidates?.entries() || []).map(
          ([name, funcs]) => ({
            name,
            functions: funcs.map((f) => f.signature),
            selectors: funcs.map((f) => f.selector),
          }),
        ),
      },
      security: {
        analysis: contract.securityAnalysis,
        recommendations: facetRecommendations,
      },
      storage: {
        layout: contract.storageLayout,
        collisions: contract.storageCollisions,
      },
    };
  }

  /**
   * Cross-reference analysis for function dependencies
   */
  crossReferenceFunctions(functions: FunctionInfo[]): Map<string, string[]> {
    const references = new Map<string, string[]>();

    for (const func of functions) {
      references.set(func.name, []);

      for (const otherFunc of functions) {
        if (otherFunc.dependencies.includes(func.name)) {
          references.get(func.name)!.push(otherFunc.name);
        }
      }
    }

    return references;
  }

  /**
   * Calculate cross-chunk communication overhead
   */
  calculateCommunicationOverhead(chunks: ChunkInfo[]): number {
    let crossDependencies = 0;

    for (let i = 0; i < chunks.length; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const chunk1Deps = new Set(chunks[i].dependencies);
        const chunk2Funcs = new Set(
          chunks[j].functions.map((f: any) => f.name),
        );

        // Count dependencies from chunk1 to chunk2
        for (const dep of Array.from(chunk1Deps)) {
          if (chunk2Funcs.has(dep)) {
            crossDependencies++;
          }
        }
      }
    }

    return crossDependencies;
  }

  /**
   * Flatten dependencies for deployment ordering
   */
  flattenDependencies(functions: FunctionInfo[]): string[] {
    const dependencies = new Set<string>();

    functions.forEach((func) => {
      func.dependencies.forEach((dep) => dependencies.add(dep));
    });

    return Array.from(new Set(dependencies)); // Remove duplicates
  }

  /**
   * Enhanced validation with comprehensive checks
   */
  private validateAnalysis(contract: ParsedContract): boolean {
    // Validate basic structure
    if (!contract.name || !contract.functions) {
      return false;
    }

    // Validate function signatures
    for (const func of contract.functions) {
      if (!func.signature || !func.selector) {
        return false;
      }
    }

    // Validate chunk consistency
    if (contract.chunkingRequired) {
      if (!contract.facetCandidates || contract.facetCandidates.size === 0) {
        return false;
      }
    }

    return true;
  }
}

// ===============================================
// CLI Interface
// ===============================================

export function createCLI(): Command {
  const program = new Command();

  program
    .name("solidity-analyzer")
    .description("Advanced Solidity contract analyzer for PayRox Go Beyond")
    .version("1.0.0");

  program
    .command("analyze")
    .description("Analyze a Solidity contract")
    .argument("<file>", "Path to the Solidity contract file")
    .option(
      "-o, --output <file>",
      "Output file for analysis results",
      "analysis.json",
    )
    .option("-c, --contract <name>", "Specific contract name to analyze")
    .option("-v, --verbose", "Enable verbose output")
    .option("--max-size <size>", "Maximum contract size threshold", "24576")
    .action(async (contractPath: string, options: any) => {
      try {
        console.log(`Analyzing contract: ${contractPath}`);

        // Check if file exists
        if (!fs.existsSync(contractPath)) {
          console.error(`Error: Contract file not found at ${contractPath}`);
          process.exit(1);
        }

        // Read contract source
        const sourceCode = fs.readFileSync(contractPath, "utf8");

        // Analyze contract
        const analyzer = new SolidityAnalyzer();
        const analysis = await analyzer.parseContract(
          sourceCode,
          options.contractName,
        );

        if (options.verbose) {
          console.log("Analysis Results:");
          console.log(`- Contract name: ${analysis.name}`);
          console.log(
            `- Functions found: ${(analysis.functions || []).length}`,
          );
          console.log(
            `- State variables: ${(analysis.variables || []).length}`,
          );
          console.log(`- Events: ${(analysis.events || []).length}`);
          console.log(`- Modifiers: ${(analysis.modifiers || []).length}`);
          console.log(`- Total size: ${analysis.totalSize}`);
          console.log(
            `- Deployment strategy: ${analysis.deploymentStrategy || "unknown"}`,
          );
          console.log(`- Chunking required: ${analysis.chunkingRequired}`);
        }

        // Write output
        fs.writeFileSync(options.output, JSON.stringify(analysis, null, 2));
        console.log(`Analysis saved to: ${options.output}`);
      } catch (error) {
        console.error("Analysis failed:", error);
        process.exit(1);
      }
    });

  program
    .command("manifest")
    .description("Generate PayRox-compatible manifest")
    .argument("<file>", "Path to the Solidity contract file")
    .option("-o, --output <file>", "Output file for manifest", "manifest.json")
    .option("-c, --contract <name>", "Specific contract name to analyze")
    .action(async (contractPath: string, options: any) => {
      try {
        if (!fs.existsSync(contractPath)) {
          console.error(`Error: Contract file not found at ${contractPath}`);
          process.exit(1);
        }

        // Read contract source
        const sourceCode = fs.readFileSync(contractPath, "utf8");

        // Analyze and generate manifest
        const analyzer = new SolidityAnalyzer();
        const analysis = await analyzer.parseContract(
          sourceCode,
          options.contractName,
        );
        const chunks = await analyzer.generateOptimizedChunks(analysis);
        const manifest = analyzer.generateManifest(analysis, chunks);

        fs.writeFileSync(options.output, JSON.stringify(manifest, null, 2));
        console.log(`Manifest saved to: ${options.output}`);
      } catch (error) {
        console.error("Manifest generation failed:", error);
        process.exit(1);
      }
    });

  return program;
}

// Export types and main analyzer
export type {
  ParsedContract,
  FunctionInfo,
  VariableInfo,
  EventInfo,
  ModifierInfo,
  ImportInfo,
  ParameterInfo,
  ChunkInfo,
  FacetCandidate,
  ManifestRoute,
};

export { AnalysisError };

// ===============================================
// Default export and CLI entry point
// ===============================================

export default SolidityAnalyzer;

if (require.main === module) {
  const cli = createCLI();
  cli.parse();
}
