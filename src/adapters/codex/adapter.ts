import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { ScanContext } from "../../core/context.js";
import type { Diagnostic } from "../../core/diagnostic.js";
import { parseToml } from "../../core/parsers/toml.js";
import { safeFsDiagnostic } from "../../core/fs/diagnostic.js";
import { item } from "../../inspectors/common.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
import { inspectMcp } from "../../inspectors/mcp.js";
import { inspectSkill } from "../../inspectors/skill.js";
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

    const inventory = [];
    const diagnostics: Diagnostic[] = [];
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
      const projectConfigSource = { rootId: "project", relativePath: ".codex/config.toml" } as const;
      const projectConfig = await safeFs.readText(projectRoot.root, projectConfigSource.relativePath);
      if (projectConfig.ok) {
        await this.addConfig(context, inventory, diagnostics, projectConfig.text, projectConfigSource, "project", 2);
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
        await this.addConfig(context, inventory, diagnostics, config.text, configSource, "user", 1);
      } else {
        const diagnostic = safeFsDiagnostic(this.agent, configSource, config);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
      }
    }

    const userHome = await safeFs.admitRoot("home");
    if (userHome.ok) {
      const skills = await safeFs.readDirectory(userHome.root, ".agents/skills");
      if (skills.ok) {
        for (const name of skills.entries) {
          const relativePath = `.agents/skills/${name}/SKILL.md`;
          const skill = await safeFs.readText(userHome.root, relativePath);
          if (skill.ok) {
            inventory.push(inspectSkill(
              { frontmatter: "missing", name },
              { agent: this.agent, source: { rootId: "home", relativePath }, scope: "user", status: "active", loading: "always" },
            ));
          }
        }
      }
    }

    return { agent: this.agent, inventory, diagnostics, coverage: inventory.length > 0 || diagnostics.length > 0 ? "partial" : "unknown" };
  }

  private async addConfig(
    context: ScanContext,
    inventory: ReturnType<typeof item>[],
    diagnostics: Diagnostic[],
    text: string,
    source: { rootId: string; relativePath: string },
    scope: "user" | "project",
    precedence: number,
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