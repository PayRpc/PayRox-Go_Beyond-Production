/**
 * Path Management Utilities
 * 
 * @author PayRox Development Team
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Read file content safely
 */
export function readFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse JSON safely
 */
export function safeParseJSON(content: string): any {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Path manager for deployment artifacts
 */
export function getPathManager() {
  const workspaceRoot = path.resolve(__dirname, '../..');
  
  return {
    getDeploymentPath(network: string, filename: string): string {
      return path.join(workspaceRoot, 'deployments', network, filename);
    },
    
    getArtifactPath(contractName: string): string {
      return path.join(workspaceRoot, 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`);
    },
    
    getConfigPath(filename: string): string {
      return path.join(workspaceRoot, 'config', filename);
    },
    
    getReportPath(filename: string): string {
      return path.join(workspaceRoot, 'reports', filename);
    },
    
    getCoveragePath(): string {
      return path.join(workspaceRoot, 'coverage', 'coverage-final.json');
    }
  };
}
