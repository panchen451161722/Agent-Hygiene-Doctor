import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { ScanContext } from "../../core/context.js";
import type { AgentId } from "../../core/agent.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
export class ClaudeAdapter implements AgentAdapter {
  readonly agent: AgentId = "claude";
  async scan(context: ScanContext): Promise<AdapterResult> { const readFile = context.fs.readFile; if (readFile === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" }; const inventory = []; const path = "CLAUDE.md"; try { const text = await readFile(context.paths.join(context.genericProjectRoot, path)); inventory.push(inspectInstruction({ text, condition: "path-scoped" }, { agent: this.agent, source: { rootId: "project", relativePath: path }, scope: "project", status: "active", loading: "always" })); } catch { /* absent */ } return { agent: this.agent, inventory, diagnostics: [], coverage: inventory.length > 0 ? "complete" : "unknown" }; }
}
export const adapter = new ClaudeAdapter();
