import fs from "fs";
import path from "path";

/**
 * Minimal AuditConsultant to satisfy TypeScript checks.
 * Keeps behaviour intentionally small and safe.
 */

interface AuditScope { contracts: string[] }
interface AuditContext { projectName?: string; repoUrl?: string; scope?: AuditScope }
interface AuditFinding { severity: "Critical" | "High" | "Medium" | "Low" | "Info"; title: string; description: string }

class AuditConsultant {
  readonly workspaceRoot: string;
  readonly context?: AuditContext;

  constructor(workspaceRoot: string, context?: AuditContext) {
    this.workspaceRoot = workspaceRoot;
    this.context = context;
  }

  async generateAuditPrep(): Promise<string> {
    const out = { timestamp: new Date().toISOString(), project: this.context?.projectName ?? path.basename(this.workspaceRoot) };
    const outPath = path.join(this.workspaceRoot, "audit-prep.json");
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
    return outPath;
  }

  async generateAuditChecklist(): Promise<string> {
    const checklist = `# Audit Checklist for ${this.context?.projectName ?? "project"}\n\n- [ ] Contracts compile\n- [ ] Tests passing\n- [ ] Selector collisions reviewed\n- [ ] EIP-170 size checks`;
    const outPath = path.join(this.workspaceRoot, "audit-checklist.md");
    fs.writeFileSync(outPath, checklist, "utf8");
    return outPath;
  }

  generateCommunicationTemplate(): string {
    const project = this.context?.projectName ?? path.basename(this.workspaceRoot);
    const repo = this.context?.repoUrl ?? "<repo-url>";
    return `Subject: Audit request - ${project}\n\nRepository: ${repo}\n\nPlease review the contracts listed in the manifest.`;
  }

  async startInteractiveSession(): Promise<void> {
    console.log("PayRox Audit Consultant (interactive)\nCommands: prep | checklist | template\n");
    const prep = await this.generateAuditPrep();
    console.log(`Generated ${prep}`);
  }
}

if (require.main === module) {
  const consultant = new AuditConsultant(process.cwd());
  const cmd = (process.argv[2] || "interactive").toLowerCase();

  switch (cmd) {
    case "prep":
      consultant.generateAuditPrep().then((p) => console.log(`Audit prep: ${p}`));
      break;
    case "checklist":
      consultant.generateAuditChecklist().then((p) => console.log(`Checklist: ${p}`));
      break;
    case "template":
      console.log(consultant.generateCommunicationTemplate());
      break;
    case "interactive":
    default:
      consultant.startInteractiveSession();
      break;
  }
}

export { AuditConsultant, type AuditContext, type AuditFinding };

