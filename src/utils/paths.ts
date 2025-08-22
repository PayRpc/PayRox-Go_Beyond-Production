import fs from 'fs';
import path from 'path';
/**
 * Path utilities for PayRox system
 */

// NOTE: duplicate imports removed above

export class PathManager {
  private workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  getContractsPath(): string {
    return path.join(this.workspaceRoot, 'contracts');
  }

  getArtifactsPath(): string {
    return path.join(this.workspaceRoot, 'artifacts');
  }

  getManifestPath(): string {
    return path.join(this.workspaceRoot, 'payrox-manifest.json');
  }

  getReportsPath(): string {
    return path.join(this.workspaceRoot, 'reports');
  }

  resolvePath(relativePath: string): string {
    return path.resolve(this.workspaceRoot, relativePath);
  }

  // Back-compat alias used by some tasks
  getAbsolutePath(p: string): string {
    return this.resolvePath(p);
  }
}

export function getPathManager(workspaceRoot?: string): PathManager {
  return new PathManager(workspaceRoot);
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function directoryExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function readFileContent(filePath: string): string {
  if (!fileExists(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeFileContent(filePath: string, content: string): void {
  const _dir = path.dirname(filePath);
  if (!directoryExists(_dir)) {
    fs.mkdirSync(_dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function safeParseJSON<T = any>(content: string, defaultValue?: T): T | null {
  try {
    return JSON.parse(content);
  } catch {
    return defaultValue ?? null;
  }
}

export function safeReadJSON<T = any>(filePath: string, defaultValue?: T): T | null {
  try {
    const _content = readFileContent(filePath);
  return safeParseJSON<T>(_content, defaultValue);
  } catch {
    return defaultValue ?? null;
  }
}

export function ensureDirectory(dirPath: string): void {
  if (!directoryExists(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function listFiles(dirPath: string, extension?: string): string[] {
  if (!directoryExists(dirPath)) {
    return [];
  }

  const _files = fs.readdirSync(dirPath);

  if (extension) {
    return _files.filter((file: string) => file.endsWith(extension));
  }

  return _files.filter((file: string) => {
    const _fullPath = path.join(dirPath, file);
    return fileExists(_fullPath);
  });
}

export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to);
}

export function joinPaths(...paths: string[]): string {
  return path.join(...paths);
}

export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}
