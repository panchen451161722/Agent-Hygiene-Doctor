import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { ScanContext } from "../../core/context.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
export class HermesAdapter implements AgentAdapter { readonly agent: AgentId = "hermes"; async scan(context: ScanContext): Promise<AdapterResult> { const safeFs = context.safeFs; if (safeFs === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" }; const root = await safeFs.admitRoot("hermes-home"); if (!root.ok) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" }; const result = await safeFs.readText(root.root, "SOUL.md"); const inventory = result.ok ? [inspectInstruction({ text: result.text, condition: "global" }, { agent: this.agent, source: { rootId: "hermes-home", relativePath: "SOUL.md" }, scope: "user", status: "active", loading: "always" })] : []; return { agent: this.agent, inventory, diagnostics: [], coverage: inventory.length > 0 ? "complete" : "unknown" }; } }
export const adapter = new HermesAdapter();
