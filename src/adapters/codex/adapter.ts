import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { ScanContext } from "../../core/context.js";
import type { AgentId } from "../../core/agent.js";
export class CodexAdapter implements AgentAdapter {
  readonly agent: AgentId = "codex";
  async scan(_context: ScanContext): Promise<AdapterResult> { return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" }; }
}
export const adapter = new CodexAdapter();