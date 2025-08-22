import fs from 'fs';
import path from 'path';
#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";

import { SolidityAnalyzer } from "./SolidityAnalyzer";

// Re-export the class so callers can `import { SolidityAnalyzer } ...`
export { SolidityAnalyzer };

// Re-export analyzer-facing types (adjust the path to your actual types folder)
export type {
  ParsedContract,
  FunctionInfo,
  VariableInfo,
  EventInfo,
  ModifierInfo,
  ImportInfo,
  ParameterInfo,
  SourceLocation,
  StorageSlot,
  CompilationError,
  AnalysisError,
  ManifestRoute,
  FacetCandidate,
} from "../../types";

// Small factory for programmatic use
export function createAnalyzer(): SolidityAnalyzer {
  return new SolidityAnalyzer();
}

// Minimal CLI runner: `node dist/analyzer/index.js refactor <file>`
export async function runCLI(argv: string[] = process.argv): Promise<void> {
  const _args = argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: <cmd> [args]");
    console.log("Commands:");
    console.log("  refactor <solidity-file>   Print JSON plan to stdout");
    process.exitCode = 0;
    return;
  }

  const [cmd, file] = args;
  if (cmd === "refactor") {
    if (!file) {
      console.error("refactor requires a path to a Solidity file");
      process.exitCode = 2;
      return;
    }

    const _resolved = path.resolve(process.cwd(), file);
    if (!fs.existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exitCode = 2;
      return;
    }

    const _source = fs.readFileSync(resolved, "utf8");
    const _analyzer = createAnalyzer();

  // Keep loose typing here to avoid tight coupling to internals
    const _result = await (analyzer as any).refactorContract(source, {});
    process.stdout.write(JSON.stringify(result, null, 2));
    return;
  }

  console.error("Unknown command:", cmd);
  process.exitCode = 1;
}

// Default export: the class (most ergonomic in TS/JS)
export default SolidityAnalyzer;

// If run directly: act as a CLI
// (CommonJS style check works under ts-node and built CJS)
if (
  // @ts-ignore
  typeof require !== "undefined" &&
  // @ts-ignore
  typeof module !== "undefined" &&
  // @ts-ignore
  require.main === module
) {
  runCLI().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}
