import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { Diagnostic } from "../../core/diagnostic.js";
import type { ScanContext } from "../../core/context.js";
import { item } from "../../inspectors/common.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
import { parseToml } from "../../core/parsers/toml.js";
import { projectCodexConfig } from "./config.js";
export class CodexAdapter implements AgentAdapter {
  readonly agent: AgentId = "codex";
  async scan(context: ScanContext): Promise<AdapterResult> {
    const safeFs = context.safeFs; if (safeFs === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };
    const inventory = []; const diagnostics: Diagnostic[] = [];
    const projectRoot = await safeFs.admitRoot("project");
    if (projectRoot.ok) {
      for (const relativePath of ["AGENTS.override.md", "AGENTS.md"]) { const result = await safeFs.readText(projectRoot.root, relativePath); if (result.ok) inventory.push(inspectInstruction({ text: result.text, condition: "path-scoped" }, { agent: this.agent, source: { rootId: "project", relativePath }, scope: "project", status: "active", loading: "always" })); }
      const projectConfig = await safeFs.readText(projectRoot.root, ".codex/config.toml");
      if (projectConfig.ok) this.addConfig(inventory, diagnostics, projectConfig.text, { rootId: "project", relativePath: ".codex/config.toml" }, "project", 2);
    }
    const homeRoot = await safeFs.admitRoot("codex-home");
    if (homeRoot.ok) { const config = await safeFs.readText(homeRoot.root, "config.toml"); if (config.ok) this.addConfig(inventory, diagnostics, config.text, { rootId: "codex-home", relativePath: "config.toml" }, "user", 1); }
    return { agent: this.agent, inventory, diagnostics, coverage: inventory.length > 0 ? "complete" : "unknown" };
  }
  private addConfig(inventory: ReturnType<typeof item>[], diagnostics: Diagnostic[], text: string, source: { rootId: string; relativePath: string }, scope: "user" | "project", precedence: number): void {
    const parsed = parseToml(text, { source });
    if (!parsed.ok) { diagnostics.push({ ...parsed.diagnostic, agent: this.agent }); inventory.push(item({ agent: this.agent, source, scope, status: "unresolved", loading: "always" }, "configuration", source.relativePath, { type: "configuration", format: "toml", parseStatus: "invalid", precedence })); return; }
    projectCodexConfig(parsed.value); inventory.push(item({ agent: this.agent, source, scope, status: "active", loading: "always" }, "configuration", source.relativePath, { type: "configuration", format: "toml", parseStatus: "valid", precedence }));
  }
}
export const adapter = new CodexAdapter();
