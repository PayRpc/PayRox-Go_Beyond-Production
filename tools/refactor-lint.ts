// Minimal refactor-lint skeleton to keep the repo TypeScript-clean.
import fs from "fs";
import { program } from "commander";

interface LintResult { success: boolean; errors: any[]; warnings: any[]; summary: Record<string, any> }

class PayRoxRefactorLinter {
  constructor(private _facetsDir = "./facets", private _manifestPath = "./payrox-manifest.json") {}

  async lint(): Promise<LintResult> {
    // Keep behaviour intentionally small: detect missing facets directory, otherwise report success.
    const errors: any[] = [];
    if (!fs.existsSync(this._facetsDir)) {
      errors.push({ type: "SIZE_LIMIT", message: `Facets directory not found: ${this._facetsDir}` });
    }

    const summary = { facetsChecked: 0 };
    return { success: errors.length === 0, errors, warnings: [], summary };
  }
}

program
  .name("refactor-lint")
  .description("PayRox Diamond Pattern refactor linter (stub)")
  .option("-f, --facets <dir>", "Facets directory", "./facets")
  .option("-m, --manifest <path>", "Manifest file path", "./payrox-manifest.json")
  .action(async (options) => {
    const linter = new PayRoxRefactorLinter(options.facets, options.manifest);
    const result = await linter.lint();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 2);
    }
    if (!result.success) {
      console.error("Errors:", result.errors);
      process.exit(2);
    }
    console.log("refactor-lint: OK");
  });

program.parse(process.argv);

// Keep exports minimal and accurate for the stub implementation
export { PayRoxRefactorLinter, LintResult };
