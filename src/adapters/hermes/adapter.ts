import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { ScanContext } from "../../core/context.js";
import type { Diagnostic } from "../../core/diagnostic.js";
import type { AdmittedRoot } from "../../core/fs/safe-fs.js";
import { parseYaml } from "../../core/parsers/yaml.js";
import { item } from "../../inspectors/common.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
import { inspectMcp } from "../../inspectors/mcp.js";
import { inspectSkill } from "../../inspectors/skill.js";
import { projectMcpServers } from "../shared/mcp.js";

export class HermesAdapter implements AgentAdapter {
  readonly agent: AgentId = "hermes";

  async scan(context: ScanContext): Promise<AdapterResult> {
    const safeFs = context.safeFs;
    if (safeFs === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };
    const root = await safeFs.admitRoot("hermes-home");
    if (!root.ok) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };

    const inventory = [];
    const diagnostics: Diagnostic[] = [];
    const soul = await safeFs.readText(root.root, "SOUL.md");
    if (soul.ok) inventory.push(inspectInstruction({ text: soul.text, condition: "global" }, { agent: this.agent, source: { rootId: "hermes-home", relativePath: "SOUL.md" }, scope: "user", status: "active", loading: "always" }));
    const config = await safeFs.readText(root.root, "config.yaml");
    if (config.ok) {
      const source = { rootId: "hermes-home", relativePath: "config.yaml" };
      const parsed = parseYaml(config.text, { source });
      if (!parsed.ok) diagnostics.push({ ...parsed.diagnostic, agent: this.agent });
      inventory.push(item({ agent: this.agent, source, scope: "user", status: parsed.ok ? "active" : "unresolved", loading: "always" }, "configuration", source.relativePath, { type: "configuration", format: "yaml", parseStatus: parsed.ok ? "valid" : "invalid", precedence: 1 }));
      if (parsed.ok) for (const server of projectMcpServers(parsed.value)) inventory.push(inspectMcp(server.input, { agent: this.agent, source, scope: "user", status: server.status, loading: "always" }));
    }
    await this.addSkills(safeFs, root.root, inventory);
    await this.addOptionalMcpCatalog(safeFs, root.root, inventory, diagnostics);
    if (context.environment?.HERMES_HOME === undefined) await this.addProfileCandidates(safeFs, root.root, inventory, diagnostics);
    return { agent: this.agent, inventory, diagnostics, coverage: inventory.length > 0 || diagnostics.length > 0 ? "partial" : "unknown" };
  }

  private async addSkills(safeFs: NonNullable<ScanContext["safeFs"]>, root: AdmittedRoot, inventory: ReturnType<typeof item>[]): Promise<void> {
    const entries = await safeFs.readDirectory(root, "skills");
    if (!entries.ok) return;
    for (const name of entries.entries) {
      const relativePath = `skills/${name}/SKILL.md`;
      const skill = await safeFs.readText(root, relativePath);
      if (skill.ok) inventory.push(inspectSkill({ frontmatter: "missing", name }, { agent: this.agent, source: { rootId: "hermes-home", relativePath }, scope: "user", status: "active", loading: "always" }));
    }
  }

  private async addOptionalMcpCatalog(safeFs: NonNullable<ScanContext["safeFs"]>, root: AdmittedRoot, inventory: ReturnType<typeof item>[], diagnostics: Diagnostic[]): Promise<void> {
    const entries = await safeFs.readDirectory(root, "optional-mcps");
    if (!entries.ok) return;
    for (const name of [...entries.entries].sort()) {
      const relativePath = `optional-mcps/${name}/manifest.yaml`;
      const manifest = await safeFs.readText(root, relativePath);
      if (!manifest.ok) continue;
      const source = { rootId: "hermes-home", relativePath };
      const parsed = parseYaml(manifest.text, { source });
      if (!parsed.ok) { diagnostics.push({ ...parsed.diagnostic, agent: this.agent }); continue; }
      inventory.push(inspectMcp({ name, transport: "stdio" }, { agent: this.agent, source, scope: "user", status: "candidate", loading: "deferred" }));
    }
  }

  private async addProfileCandidates(safeFs: NonNullable<ScanContext["safeFs"]>, root: AdmittedRoot, inventory: ReturnType<typeof item>[], diagnostics: Diagnostic[]): Promise<void> {
    const activeProfile = await safeFs.readText(root, "active_profile");
    if (!activeProfile.ok) return;
    const stickyName = activeProfile.text.trim();
    const entries = await safeFs.readDirectory(root, "profiles");
    if (!entries.ok) return;
    for (const name of [...entries.entries].sort()) {
      const relativePath = `profiles/${name}/config.yaml`;
      const config = await safeFs.readText(root, relativePath);
      if (!config.ok) continue;
      const source = { rootId: "hermes-home", relativePath };
      const parsed = parseYaml(config.text, { source });
      const status = name === stickyName ? "unresolved" as const : "candidate" as const;
      if (!parsed.ok) { diagnostics.push({ ...parsed.diagnostic, agent: this.agent }); continue; }
      inventory.push(item({ agent: this.agent, source, scope: "user", status, loading: "deferred" }, "configuration", relativePath, { type: "configuration", format: "yaml", parseStatus: "valid", precedence: 0 }));
      for (const server of projectMcpServers(parsed.value)) inventory.push(inspectMcp(server.input, { agent: this.agent, source, scope: "user", status: server.status === "disabled" ? "disabled" : status, loading: "deferred" }));
    }
  }
}

export const adapter = new HermesAdapter();