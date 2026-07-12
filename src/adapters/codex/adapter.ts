import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { ScanContext } from "../../core/context.js";
import type { AgentId } from "../../core/agent.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
import { resolveCodexRoots } from "./roots.js";
export class CodexAdapter implements AgentAdapter {
  readonly agent: AgentId = "codex";
  async scan(context: ScanContext): Promise<AdapterResult> {
    const readFile = context.fs.readFile;
    if (readFile === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };
    const roots = resolveCodexRoots(context); const inventory = [];
    for (const relativePath of ["AGENTS.override.md", "AGENTS.md"]) {
      try { const text = await readFile(context.paths.join(roots.projectRoot, relativePath)); inventory.push(inspectInstruction({ text, condition: "path-scoped" }, { agent: this.agent, source: { rootId: "project", relativePath }, scope: "project", status: "active", loading: "always" })); } catch { /* absent */ }
    }
    return { agent: this.agent, inventory, diagnostics: [], coverage: inventory.length > 0 ? "complete" : "unknown" };
  }
}
export const adapter = new CodexAdapter();
