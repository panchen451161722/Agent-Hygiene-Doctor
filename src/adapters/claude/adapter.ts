import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { Diagnostic } from "../../core/diagnostic.js";
import type { ScanContext } from "../../core/context.js";
import { parseJson } from "../../core/parsers/json.js";
import { item } from "../../inspectors/common.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
export class ClaudeAdapter implements AgentAdapter {
  readonly agent: AgentId = "claude";
  async scan(context: ScanContext): Promise<AdapterResult> {
    const safeFs = context.safeFs; if (safeFs === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" }; const inventory = []; const diagnostics: Diagnostic[] = [];
    const project = await safeFs.admitRoot("project"); if (project.ok) { const instruction = await safeFs.readText(project.root, "CLAUDE.md"); if (instruction.ok) inventory.push(inspectInstruction({ text: instruction.text, condition: "path-scoped" }, { agent: this.agent, source: { rootId: "project", relativePath: "CLAUDE.md" }, scope: "project", status: "active", loading: "always" })); const settings = await safeFs.readText(project.root, ".claude/settings.json"); if (settings.ok) this.addSettings(inventory, diagnostics, settings.text, { rootId: "project", relativePath: ".claude/settings.json" }, "project", 2); }
    const home = await safeFs.admitRoot("claude-home"); if (home.ok) { const settings = await safeFs.readText(home.root, "settings.json"); if (settings.ok) this.addSettings(inventory, diagnostics, settings.text, { rootId: "claude-home", relativePath: "settings.json" }, "user", 1); }
    return { agent: this.agent, inventory, diagnostics, coverage: inventory.length > 0 ? "complete" : "unknown" };
  }
  private addSettings(inventory: ReturnType<typeof item>[], diagnostics: Diagnostic[], text: string, source: { rootId: string; relativePath: string }, scope: "user" | "project", precedence: number): void { const parsed = parseJson(text, { source }); const facts = { type: "configuration" as const, format: "json" as const, parseStatus: parsed.ok ? "valid" as const : "invalid" as const, precedence }; if (!parsed.ok) diagnostics.push({ ...parsed.diagnostic, agent: this.agent }); inventory.push(item({ agent: this.agent, source, scope, status: parsed.ok ? "active" : "unresolved", loading: "always" }, "configuration", source.relativePath, facts)); }
}
export const adapter = new ClaudeAdapter();
