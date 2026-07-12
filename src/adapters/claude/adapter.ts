import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { ScanContext } from "../../core/context.js";
import type { Diagnostic } from "../../core/diagnostic.js";
import type { AdmittedRoot } from "../../core/fs/safe-fs.js";
import { parseJson } from "../../core/parsers/json.js";
import { item } from "../../inspectors/common.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
import { inspectSkill } from "../../inspectors/skill.js";

export class ClaudeAdapter implements AgentAdapter {
  readonly agent: AgentId = "claude";

  async scan(context: ScanContext): Promise<AdapterResult> {
    const safeFs = context.safeFs;
    if (safeFs === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };

    const inventory = [];
    const diagnostics: Diagnostic[] = [];
    const project = await safeFs.admitRoot("project");
    if (project.ok) {
      const instruction = await safeFs.readText(project.root, "CLAUDE.md");
      if (instruction.ok) inventory.push(inspectInstruction({ text: instruction.text, condition: "path-scoped" }, { agent: this.agent, source: { rootId: "project", relativePath: "CLAUDE.md" }, scope: "project", status: "active", loading: "always" }));
      const settings = await safeFs.readText(project.root, ".claude/settings.json");
      if (settings.ok) this.addSettings(inventory, diagnostics, settings.text, { rootId: "project", relativePath: ".claude/settings.json" }, "project", 2);
      await this.addSkills(safeFs, project.root, ".claude/skills", "project", "project", inventory);
    }

    const home = await safeFs.admitRoot("claude-home");
    if (home.ok) {
      const settings = await safeFs.readText(home.root, "settings.json");
      if (settings.ok) this.addSettings(inventory, diagnostics, settings.text, { rootId: "claude-home", relativePath: "settings.json" }, "user", 1);
      await this.addSkills(safeFs, home.root, "skills", "claude-home", "user", inventory);
    }

    return { agent: this.agent, inventory, diagnostics, coverage: inventory.length > 0 ? "complete" : "unknown" };
  }

  private async addSkills(safeFs: NonNullable<ScanContext["safeFs"]>, root: AdmittedRoot, directory: string, rootId: string, scope: "user" | "project", inventory: ReturnType<typeof item>[]): Promise<void> {
    const entries = await safeFs.readDirectory(root, directory);
    if (!entries.ok) return;
    for (const name of entries.entries) {
      const relativePath = `${directory}/${name}/SKILL.md`;
      const skill = await safeFs.readText(root, relativePath);
      if (skill.ok) inventory.push(inspectSkill({ frontmatter: "missing", name }, { agent: this.agent, source: { rootId, relativePath }, scope, status: "active", loading: "always" }));
    }
  }

  private addSettings(inventory: ReturnType<typeof item>[], diagnostics: Diagnostic[], text: string, source: { rootId: string; relativePath: string }, scope: "user" | "project", precedence: number): void {
    const parsed = parseJson(text, { source });
    const facts = { type: "configuration" as const, format: "json" as const, parseStatus: parsed.ok ? "valid" as const : "invalid" as const, precedence };
    if (!parsed.ok) diagnostics.push({ ...parsed.diagnostic, agent: this.agent });
    inventory.push(item({ agent: this.agent, source, scope, status: parsed.ok ? "active" : "unresolved", loading: "always" }, "configuration", source.relativePath, facts));
  }
}

export const adapter = new ClaudeAdapter();