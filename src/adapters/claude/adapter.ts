import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { ScanContext } from "../../core/context.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
export class ClaudeAdapter implements AgentAdapter { readonly agent: AgentId = "claude"; async scan(context: ScanContext): Promise<AdapterResult> { const safeFs = context.safeFs; if (safeFs === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" }; const root = await safeFs.admitRoot("project"); if (!root.ok) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" }; const result = await safeFs.readText(root.root, "CLAUDE.md"); const inventory = result.ok ? [inspectInstruction({ text: result.text, condition: "path-scoped" }, { agent: this.agent, source: { rootId: "project", relativePath: "CLAUDE.md" }, scope: "project", status: "active", loading: "always" })] : []; return { agent: this.agent, inventory, diagnostics: [], coverage: inventory.length > 0 ? "complete" : "unknown" }; } }
export const adapter = new ClaudeAdapter();
