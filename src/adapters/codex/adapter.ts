import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { ScanContext } from "../../core/context.js";
import type { Diagnostic } from "../../core/diagnostic.js";
import { parseToml } from "../../core/parsers/toml.js";
import { safeFsDiagnostic } from "../../core/fs/diagnostic.js";
import { item } from "../../inspectors/common.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
import { inspectMcp } from "../../inspectors/mcp.js";
import { scanSkillDirectory } from "../shared/skills.js";
import { projectCodexConfig } from "./config.js";
import { projectCodexMcp } from "./mcp.js";
import { resolveMcpCommands } from "../shared/command-resolution.js";

export class CodexAdapter implements AgentAdapter {
  readonly agent: AgentId = "codex";

  async scan(context: ScanContext): Promise<AdapterResult> {
    const safeFs = context.safeFs;
    if (safeFs === undefined) {
      return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };
    }

    const inventory: ReturnType<typeof item>[] = [];
    const diagnostics: Diagnostic[] = [];
    const skillSettings = new Map<string, { enabled: boolean; precedence: number }>();
    const projectRoot = await safeFs.admitRoot("project");
    if (projectRoot.ok) {
      for (const relativePath of ["AGENTS.override.md", "AGENTS.md"]) {
        const result = await safeFs.readText(projectRoot.root, relativePath);
        if (result.ok) {
          inventory.push(inspectInstruction(
            { text: result.text, condition: "path-scoped" },
            { agent: this.agent, source: { rootId: "project", relativePath }, scope: "project", status: "active", loading: "always" },
          ));
        }
      }
      await scanSkillDirectory({ safeFs, root: projectRoot.root, directory: ".agents/skills", rootId: "project", scope: "project", agent: this.agent, inventory, diagnostics });
      const projectConfigSource = { rootId: "project", relativePath: ".codex/config.toml" } as const;
      const projectConfig = await safeFs.readText(projectRoot.root, projectConfigSource.relativePath);
      if (projectConfig.ok) {
        await this.addConfig(context, inventory, diagnostics, projectConfig.text, projectConfigSource, "project", 2, skillSettings);
      } else {
        const diagnostic = safeFsDiagnostic(this.agent, projectConfigSource, projectConfig);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
      }
    }

    const codexHome = await safeFs.admitRoot("codex-home");
    if (codexHome.ok) {
      const configSource = { rootId: "codex-home", relativePath: "config.toml" } as const;
      const config = await safeFs.readText(codexHome.root, configSource.relativePath);
      if (config.ok) {
        await this.addConfig(context, inventory, diagnostics, config.text, configSource, "user", 1, skillSettings);
      } else {
        const diagnostic = safeFsDiagnostic(this.agent, configSource, config);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
      }

      for (const directory of ["skills", "skills/.system"]) {
        await scanSkillDirectory({ safeFs, root: codexHome.root, directory, rootId: "codex-home", scope: directory.endsWith(".system") ? "managed" : "user", agent: this.agent, inventory, diagnostics });
      }
    }

    const userHome = await safeFs.admitRoot("home");
    if (userHome.ok) {
      await scanSkillDirectory({ safeFs, root: userHome.root, directory: ".agents/skills", rootId: "home", scope: "user", agent: this.agent, inventory, diagnostics });
    }

    const effectiveInventory = inventory.map((entry) => {
      if (entry.kind !== "skill" || skillSettings.size === 0) return entry;
      const root = context.roots.getAbsolutePathForScan(entry.source.rootId);
      if (root === undefined) return entry;
      const path = context.paths.join(root, entry.source.relativePath);
      const setting = [...skillSettings].find(([configured]) => context.paths.compare(configured, path) === 0)?.[1];
      return setting?.enabled === false ? { ...entry, status: "disabled" as const } : entry;
    });
    return { agent: this.agent, inventory: effectiveInventory, diagnostics, coverage: inventory.length > 0 || diagnostics.length > 0 ? "partial" : "unknown" };
  }

  private async addConfig(
    context: ScanContext,
    inventory: ReturnType<typeof item>[],
    diagnostics: Diagnostic[],
    text: string,
    source: { rootId: string; relativePath: string },
    scope: "user" | "project",
    precedence: number,
    skillSettings: Map<string, { enabled: boolean; precedence: number }>,
  ): Promise<void> {
    const parsed = parseToml(text, { source });
    if (!parsed.ok) {
      diagnostics.push({ ...parsed.diagnostic, agent: this.agent });
      inventory.push(item(
        { agent: this.agent, source, scope, status: "unresolved", loading: "always" },
        "configuration",
        source.relativePath,
        { type: "configuration", format: "toml", parseStatus: "invalid", precedence },
      ));
      return;
    }
    projectCodexConfig(parsed.value);
    if (typeof parsed.value === "object" && parsed.value !== null) {
      const skills = (parsed.value as Record<string, unknown>).skills;
      if (typeof skills === "object" && skills !== null && "config" in skills && Array.isArray(skills.config)) {
        for (const setting of skills.config) {
          if (typeof setting !== "object" || setting === null || typeof setting.path !== "string" || typeof setting.enabled !== "boolean") continue;
          if (!context.paths.isAbsolute(setting.path)) continue;
          const path = context.paths.normalize(setting.path);
          if (precedence >= (skillSettings.get(path)?.precedence ?? -1)) skillSettings.set(path, { enabled: setting.enabled, precedence });
        }
      }
    }
    inventory.push(item(
      { agent: this.agent, source, scope, status: "active", loading: "always" },
      "configuration",
      source.relativePath,
      { type: "configuration", format: "toml", parseStatus: "valid", precedence },
    ));
    for (const server of await resolveMcpCommands(context, projectCodexMcp(parsed.value))) {
      inventory.push(inspectMcp(server.input, {
        agent: this.agent,
        source,
        scope,
        status: server.status,
        loading: "always",
      }));
    }
  }
}

export const adapter = new CodexAdapter();
