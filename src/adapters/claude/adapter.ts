import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { ScanContext } from "../../core/context.js";
import type { Diagnostic } from "../../core/diagnostic.js";
import type { AdmittedRoot } from "../../core/fs/safe-fs.js";
import { parseJson } from "../../core/parsers/json.js";
import { inspectMcp } from "../../inspectors/mcp.js";
import { item } from "../../inspectors/common.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
import { inspectSkill } from "../../inspectors/skill.js";
import { projectMcpServers } from "../shared/mcp.js";
import { resolveMcpCommands } from "../shared/command-resolution.js";
import { hasClaudeProjectMcpApproval } from "./approval.js";

export class ClaudeAdapter implements AgentAdapter {
  readonly agent: AgentId = "claude";

  async scan(context: ScanContext): Promise<AdapterResult> {
    const safeFs = context.safeFs;
    if (safeFs === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };

    const inventory: ReturnType<typeof item>[] = [];
    const diagnostics: Diagnostic[] = [];
    const mcpPrecedence = new Map<string, number>();
    let projectMcpApproved = false;
    const approvalHome = await safeFs.admitRoot("home");
    if (approvalHome.ok) {
      const application = await safeFs.readText(approvalHome.root, ".claude.json");
      if (application.ok) {
        const parsed = parseJson(application.text, { source: { rootId: "home", relativePath: ".claude.json" } });
        projectMcpApproved = parsed.ok && hasClaudeProjectMcpApproval(parsed.value, context.genericProjectRoot);
      }
    }
    const project = await safeFs.admitRoot("project");
    if (project.ok) {
      const instruction = await safeFs.readText(project.root, "CLAUDE.md");
      if (instruction.ok) inventory.push(inspectInstruction({ text: instruction.text, condition: "path-scoped" }, { agent: this.agent, source: { rootId: "project", relativePath: "CLAUDE.md" }, scope: "project", status: "active", loading: "always" }));
      const settings = await safeFs.readText(project.root, ".claude/settings.json");
      if (settings.ok) await this.addSettings(context, inventory, diagnostics, mcpPrecedence, settings.text, { rootId: "project", relativePath: ".claude/settings.json" }, "project", 2);
      const localSettings = await safeFs.readText(project.root, ".claude/settings.local.json");
      if (localSettings.ok) await this.addSettings(context, inventory, diagnostics, mcpPrecedence, localSettings.text, { rootId: "project", relativePath: ".claude/settings.local.json" }, "project", 3);
      const mcp = await safeFs.readText(project.root, ".mcp.json");
      if (mcp.ok) await this.addMcpFile(context, inventory, diagnostics, mcpPrecedence, mcp.text, { rootId: "project", relativePath: ".mcp.json" }, "project", 2, projectMcpApproved ? "active" : "unresolved");
      await this.addSkills(safeFs, project.root, ".claude/skills", "project", "project", inventory);
    }

    const home = await safeFs.admitRoot("claude-home");
    if (home.ok) {
      const settings = await safeFs.readText(home.root, "settings.json");
      if (settings.ok) await this.addSettings(context, inventory, diagnostics, mcpPrecedence, settings.text, { rootId: "claude-home", relativePath: "settings.json" }, "user", 1);
      await this.addManagedSettings(context, safeFs, home.root, inventory, diagnostics, mcpPrecedence);
      const managedMcp = await safeFs.readText(home.root, "managed-mcp.json");
      if (managedMcp.ok) await this.addMcpFile(context, inventory, diagnostics, mcpPrecedence, managedMcp.text, { rootId: "claude-home", relativePath: "managed-mcp.json" }, "managed", 5);
      await this.addSkills(safeFs, home.root, "skills", "claude-home", "user", inventory);
    }

    const applicationHome = await safeFs.admitRoot("home");
    if (applicationHome.ok) {
      const application = await safeFs.readText(applicationHome.root, ".claude.json");
      if (application.ok) await this.addMcpFile(context, inventory, diagnostics, mcpPrecedence, application.text, { rootId: "home", relativePath: ".claude.json" }, "user", 1);
    }
    return { agent: this.agent, inventory: this.applyMcpPrecedence(inventory, mcpPrecedence), diagnostics, coverage: inventory.length > 0 || diagnostics.length > 0 ? "partial" : "unknown" };
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

  private async addMcpItems(context: ScanContext, inventory: ReturnType<typeof item>[], precedenceByItemId: Map<string, number>, value: unknown, source: { rootId: string; relativePath: string }, scope: "user" | "project" | "managed", precedence: number, activeStatus: "active" | "unresolved" = "active"): Promise<void> {
    const projected = projectMcpServers(value, "mcpServers").map((server) => server.status === "active" ? { ...server, status: activeStatus } : server);
    for (const server of await resolveMcpCommands(context, projected)) {
      const mcp = inspectMcp(server.input, { agent: this.agent, source, scope, status: server.status, loading: "always" });
      inventory.push(mcp);
      precedenceByItemId.set(mcp.itemId, precedence);
    }
  }

  private async addMcpFile(context: ScanContext, inventory: ReturnType<typeof item>[], diagnostics: Diagnostic[], precedenceByItemId: Map<string, number>, text: string, source: { rootId: string; relativePath: string }, scope: "user" | "project" | "managed", precedence: number, activeStatus: "active" | "unresolved" = "active"): Promise<void> {
    const parsed = parseJson(text, { source });
    if (!parsed.ok) { diagnostics.push({ ...parsed.diagnostic, agent: this.agent }); return; }
    await this.addMcpItems(context, inventory, precedenceByItemId, parsed.value, source, scope, precedence, activeStatus);
  }

  private async addSettings(context: ScanContext, inventory: ReturnType<typeof item>[], diagnostics: Diagnostic[], precedenceByItemId: Map<string, number>, text: string, source: { rootId: string; relativePath: string }, scope: "user" | "project" | "managed", precedence: number): Promise<void> {
    const parsed = parseJson(text, { source });
    const facts = { type: "configuration" as const, format: "json" as const, parseStatus: parsed.ok ? "valid" as const : "invalid" as const, precedence };
    if (!parsed.ok) diagnostics.push({ ...parsed.diagnostic, agent: this.agent });
    inventory.push(item({ agent: this.agent, source, scope, status: parsed.ok ? "active" : "unresolved", loading: "always" }, "configuration", source.relativePath, facts));
    if (parsed.ok) await this.addMcpItems(context, inventory, precedenceByItemId, parsed.value, source, scope, precedence);
  }

  private async addManagedSettings(context: ScanContext, safeFs: NonNullable<ScanContext["safeFs"]>, root: AdmittedRoot, inventory: ReturnType<typeof item>[], diagnostics: Diagnostic[], precedenceByItemId: Map<string, number>): Promise<void> {
    const managed = await safeFs.readText(root, "managed-settings.json");
    if (managed.ok) await this.addSettings(context, inventory, diagnostics, precedenceByItemId, managed.text, { rootId: "claude-home", relativePath: "managed-settings.json" }, "managed", 5);
    const directory = await safeFs.readDirectory(root, "managed-settings.d");
    if (!directory.ok) return;
    for (const name of [...directory.entries].filter((entry) => entry.endsWith(".json")).sort()) {
      const relativePath = `managed-settings.d/${name}`;
      const settings = await safeFs.readText(root, relativePath);
      if (settings.ok) await this.addSettings(context, inventory, diagnostics, precedenceByItemId, settings.text, { rootId: "claude-home", relativePath }, "managed", 5);
    }
  }

  private applyMcpPrecedence(inventory: readonly ReturnType<typeof item>[], precedenceByItemId: ReadonlyMap<string, number>): ReturnType<typeof item>[] {
    const greatestByName = new Map<string, number>();
    for (const entry of inventory) {
      if (entry.kind !== "mcp" || entry.status === "unresolved") continue;
      const precedence = precedenceByItemId.get(entry.itemId);
      if (precedence !== undefined && precedence > (greatestByName.get(entry.name) ?? -1)) greatestByName.set(entry.name, precedence);
    }
    return inventory.map((entry) => entry.kind !== "mcp" || entry.status !== "active" || precedenceByItemId.get(entry.itemId) === greatestByName.get(entry.name) ? entry : { ...entry, status: "shadowed" });
  }
}

export const adapter = new ClaudeAdapter();