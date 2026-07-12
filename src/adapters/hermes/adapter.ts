import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { ScanContext } from "../../core/context.js";
import type { AgentId } from "../../core/agent.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
export class HermesAdapter implements AgentAdapter {
  readonly agent: AgentId = "hermes";
  async scan(context: ScanContext): Promise<AdapterResult> {
    const readFile = context.fs.readFile;
    if (readFile === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };
    const inventory = []; const path = "SOUL.md";
    try { const text = await readFile(context.paths.join(context.environment.HERMES_HOME ?? context.paths.join(context.userHome, ".hermes"), path)); inventory.push(inspectInstruction({ text, condition: "global" }, { agent: this.agent, source: { rootId: "home", relativePath: path }, scope: "user", status: "active", loading: "always" })); } catch { /* absent */ }
    return { agent: this.agent, inventory, diagnostics: [], coverage: inventory.length > 0 ? "complete" : "unknown" };
  }
}
export const adapter = new HermesAdapter();
