import type { AgentAdapter, AdapterResult } from "../../core/adapter.js";
import type { AgentId } from "../../core/agent.js";
import type { ScanContext } from "../../core/context.js";
import type { Diagnostic } from "../../core/diagnostic.js";
import { safeFsDiagnostic } from "../../core/fs/diagnostic.js";
import type { AdmittedRoot } from "../../core/fs/safe-fs.js";
import type { InventoryItem } from "../../core/inventory.js";
import { parseJsonc } from "../../core/parsers/json.js";
import { item } from "../../inspectors/common.js";
import { inspectExtension } from "../../inspectors/extension.js";
import { inspectInstruction } from "../../inspectors/instruction.js";
import { scanSkillDirectory } from "../shared/skills.js";
import { projectPiSettings, type PiDefaultProjectTrust } from "./settings.js";

type ProjectResourceStatus = "active" | "disabled" | "candidate";

const projectStatus = (savedDecision: boolean | undefined, defaultTrust: PiDefaultProjectTrust): ProjectResourceStatus => {
  if (savedDecision === true || (savedDecision === undefined && defaultTrust === "always")) return "active";
  if (savedDecision === false || (savedDecision === undefined && defaultTrust === "never")) return "disabled";
  return "candidate";
};

const savedTrustDecision = (value: unknown, context: ScanContext, projectPath: string): boolean | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  let best: { readonly path: string; readonly value: boolean } | undefined;
  for (const [rawPath, decision] of Object.entries(value)) {
    if (decision !== true && decision !== false || !context.paths.isAbsolute(rawPath)) continue;
    try {
      const path = context.paths.normalize(rawPath);
      if (!context.paths.contains(path, projectPath)) continue;
      if (best === undefined || path.length > best.path.length) best = { path, value: decision };
    } catch {
      // A malformed persisted path cannot affect this scan.
    }
  }
  return best?.value;
};

const extensionActivation = (status: ProjectResourceStatus): "active" | "disabled" | "candidate" => status;

export class PiAdapter implements AgentAdapter {
  readonly agent: AgentId = "pi";

  async scan(context: ScanContext): Promise<AdapterResult> {
    const safeFs = context.safeFs;
    if (safeFs === undefined) return { agent: this.agent, inventory: [], diagnostics: [], coverage: "unknown" };

    const inventory: InventoryItem[] = [];
    const diagnostics: Diagnostic[] = [];
    let defaultTrust: PiDefaultProjectTrust = "ask";
    let savedTrust: boolean | undefined;
    const project = await safeFs.admitRoot("project");
    const projectPath = project.ok && typeof project.root.canonicalPath === "string" ? project.root.canonicalPath : context.selectedWorkingDirectory;
    const piHome = await safeFs.admitRoot("pi-home");
    if (piHome.ok) {
      const globalSettings = await safeFs.readText(piHome.root, "settings.json");
      if (globalSettings.ok) defaultTrust = this.addSettings(inventory, diagnostics, globalSettings.text, { rootId: "pi-home", relativePath: "settings.json" }, "user", "active", "always", 1);
      else {
        const diagnostic = safeFsDiagnostic(this.agent, { rootId: "pi-home", relativePath: "settings.json" }, globalSettings);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
      }

      const trust = await safeFs.readText(piHome.root, "trust.json");
      if (trust.ok) {
        const parsed = parseJsonc(trust.text, { source: { rootId: "pi-home", relativePath: "trust.json" } });
        if (parsed.ok) savedTrust = savedTrustDecision(parsed.value, context, projectPath);
        else diagnostics.push({ ...parsed.diagnostic, agent: this.agent });
      } else {
        const diagnostic = safeFsDiagnostic(this.agent, { rootId: "pi-home", relativePath: "trust.json" }, trust);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
      }
    }

    const localStatus = projectStatus(savedTrust, defaultTrust);
    if (project.ok) {
      await this.addProjectContext(safeFs, project.root, inventory);
      const settings = await safeFs.readText(project.root, ".pi/settings.json");
      if (settings.ok) this.addSettings(inventory, diagnostics, settings.text, { rootId: "project", relativePath: ".pi/settings.json" }, "project", localStatus, "conditional", 2);
      else {
        const diagnostic = safeFsDiagnostic(this.agent, { rootId: "project", relativePath: ".pi/settings.json" }, settings);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
      }
      await this.addInstructions(safeFs, project.root, [".pi/SYSTEM.md", ".pi/APPEND_SYSTEM.md"], "project", "project", localStatus, "conditional", "path-scoped", inventory);
      await scanSkillDirectory({ safeFs, root: project.root, directory: ".pi/skills", rootId: "project", scope: "project", agent: this.agent, inventory, diagnostics, recursive: true, flatMarkdownFiles: true, status: localStatus, loading: "conditional" });
      await scanSkillDirectory({ safeFs, root: project.root, directory: ".agents/skills", rootId: "project", scope: "project", agent: this.agent, inventory, diagnostics, recursive: true, status: localStatus, loading: "conditional" });
      await this.addExtensions(safeFs, project.root, ".pi/extensions", "project", "project", localStatus, "conditional", inventory, diagnostics);
    }

    if (piHome.ok) {
      await this.addInstructions(safeFs, piHome.root, ["AGENTS.md", "SYSTEM.md", "APPEND_SYSTEM.md"], "pi-home", "user", "active", "always", "global", inventory);
      await scanSkillDirectory({ safeFs, root: piHome.root, directory: "skills", rootId: "pi-home", scope: "user", agent: this.agent, inventory, diagnostics, recursive: true, flatMarkdownFiles: true });
      await this.addExtensions(safeFs, piHome.root, "extensions", "pi-home", "user", "active", "always", inventory, diagnostics);
    }

    const home = await safeFs.admitRoot("home");
    if (home.ok) {
      await scanSkillDirectory({ safeFs, root: home.root, directory: ".agents/skills", rootId: "home", scope: "user", agent: this.agent, inventory, diagnostics, recursive: true });
    }

    return { agent: this.agent, inventory, diagnostics, coverage: inventory.length > 0 || diagnostics.length > 0 ? "partial" : "unknown" };
  }

  private addSettings(
    inventory: InventoryItem[],
    diagnostics: Diagnostic[],
    text: string,
    source: { readonly rootId: string; readonly relativePath: string },
    scope: "user" | "project",
    status: ProjectResourceStatus,
    loading: InventoryItem["loading"],
    precedence: number,
  ): PiDefaultProjectTrust {
    const parsed = parseJsonc(text, { source });
    inventory.push(item(
      { agent: this.agent, source, scope, status: parsed.ok ? status : "unresolved", loading },
      "configuration",
      source.relativePath,
      { type: "configuration", format: "json", parseStatus: parsed.ok ? "valid" : "invalid", precedence },
    ));
    if (!parsed.ok) {
      diagnostics.push({ ...parsed.diagnostic, agent: this.agent });
      return "ask";
    }
    return projectPiSettings(parsed.value).defaultProjectTrust;
  }

  private async addProjectContext(safeFs: NonNullable<ScanContext["safeFs"]>, root: AdmittedRoot, inventory: InventoryItem[]): Promise<void> {
    await this.addInstructions(safeFs, root, ["AGENTS.override.md", "AGENTS.md", "CLAUDE.md"], "project", "project", "active", "always", "path-scoped", inventory);
  }

  private async addInstructions(
    safeFs: NonNullable<ScanContext["safeFs"]>,
    root: AdmittedRoot,
    paths: readonly string[],
    rootId: string,
    scope: InventoryItem["scope"],
    status: ProjectResourceStatus,
    loading: InventoryItem["loading"],
    condition: "global" | "path-scoped",
    inventory: InventoryItem[],
  ): Promise<void> {
    for (const relativePath of paths) {
      const instruction = await safeFs.readText(root, relativePath);
      if (!instruction.ok) continue;
      inventory.push(inspectInstruction({ text: instruction.text, condition }, { agent: this.agent, source: { rootId, relativePath }, scope, status, loading }));
    }
  }

  private async addExtensions(
    safeFs: NonNullable<ScanContext["safeFs"]>,
    root: AdmittedRoot,
    directory: string,
    rootId: string,
    scope: InventoryItem["scope"],
    status: ProjectResourceStatus,
    loading: InventoryItem["loading"],
    inventory: InventoryItem[],
    diagnostics: Diagnostic[],
  ): Promise<void> {
    const entries = await safeFs.readDirectory(root, directory);
    if (!entries.ok) {
      const diagnostic = safeFsDiagnostic(this.agent, { rootId, relativePath: directory }, entries);
      if (diagnostic !== undefined) diagnostics.push(diagnostic);
      return;
    }
    for (const name of entries.entries) {
      if (name.startsWith(".")) continue;
      const relativePath = name.endsWith(".ts") ? `${directory}/${name}` : `${directory}/${name}/index.ts`;
      const extension = await safeFs.readText(root, relativePath);
      if (!extension.ok) {
        if (extension.diagnostic.code === "limit_exceeded") {
          const diagnostic = safeFsDiagnostic(this.agent, { rootId, relativePath }, extension);
          if (diagnostic !== undefined) diagnostics.push(diagnostic);
          return;
        }
        continue;
      }
      inventory.push(inspectExtension({ extensionKind: "hook", activation: extensionActivation(status), name }, { agent: this.agent, source: { rootId, relativePath }, scope, status, loading }));
    }
  }
}

export const adapter = new PiAdapter();
