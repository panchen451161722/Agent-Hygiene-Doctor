import type { AgentId } from "../../core/agent.js";
import { DIAGNOSTIC_MESSAGES, type Diagnostic } from "../../core/diagnostic.js";
import type { AdmittedRoot, SafeFileSystem } from "../../core/fs/safe-fs.js";
import { safeFsDiagnostic } from "../../core/fs/diagnostic.js";
import type { InventoryItem } from "../../core/inventory.js";
import { parseYaml } from "../../core/parsers/yaml.js";
import type { SourceRef } from "../../core/source-ref.js";
import { inspectSkill, type SkillInput } from "../../inspectors/skill.js";

/** Parse only the metadata; never expose the skill body in a report. */
export const parseSkill = (text: string, source: SourceRef): SkillInput => {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trimEnd() !== "---") return { frontmatter: "missing" };
  const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
  if (end < 0) return { frontmatter: "malformed" };
  const parsed = parseYaml(lines.slice(1, end).join("\n"), { source });
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) return { frontmatter: "malformed" };
  const metadata = parsed.value as Record<string, unknown>;
  return {
    frontmatter: "valid",
    ...(typeof metadata.name === "string" ? { name: metadata.name } : {}),
    ...(typeof metadata.description === "string" ? { description: metadata.description } : {}),
  };
};

interface SkillDirectoryOptions {
  readonly safeFs: SafeFileSystem;
  readonly root: AdmittedRoot;
  readonly rootId: string;
  readonly directory: string;
  readonly agent: AgentId;
  readonly scope: InventoryItem["scope"];
  readonly inventory: InventoryItem[];
  readonly diagnostics: Diagnostic[];
  /** Defaults preserve the discovery rules of the existing adapters. */
  readonly recursive?: boolean;
  /** Pi also discovers top-level Markdown files as individual skills. */
  readonly flatMarkdownFiles?: boolean;
  readonly status?: InventoryItem["status"];
  readonly loading?: InventoryItem["loading"];
}

/** Agent-specific adapters select the supported container and discovery mode. */
export const scanSkillDirectory = async (options: SkillDirectoryOptions): Promise<void> => {
  const { safeFs, root, rootId, directory, agent, scope, inventory, diagnostics } = options;
  const status = options.status ?? "active";
  const loading = options.loading ?? "lazy";
  const addSkill = (text: string, source: SourceRef, fallbackName: string): void => {
    const input = parseSkill(text, source);
    const inspected = inspectSkill(input, { agent, source, scope, status, loading });
    // A path is a display fallback, not evidence of usable metadata.
    inventory.push({ ...inspected, name: input.name?.trim() ? inspected.name : fallbackName });
    if (input.frontmatter === "malformed") diagnostics.push({
      code: "parse_error", severity: "warning", agent, source,
      coverageImpact: "partial", message: DIAGNOSTIC_MESSAGES.parse_error,
    });
  };

  if (options.recursive !== true && options.flatMarkdownFiles !== true) {
    const entries = await safeFs.readDirectory(root, directory);
    if (!entries.ok) {
      const diagnostic = safeFsDiagnostic(agent, { rootId, relativePath: directory }, entries);
      if (diagnostic !== undefined) diagnostics.push(diagnostic);
      return;
    }
    for (const name of entries.entries) {
      if (name.startsWith(".")) continue;
      const source = { rootId, relativePath: `${directory}/${name}/SKILL.md` };
      const skill = await safeFs.readText(root, source.relativePath);
      if (!skill.ok) {
        const diagnostic = safeFsDiagnostic(agent, source, skill);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
        if (skill.diagnostic.code === "limit_exceeded") break;
        continue;
      }
      addSkill(skill.text, source, name);
    }
    return;
  }

  const scanDirectory = async (currentDirectory: string, reportFailure: boolean, isRoot: boolean): Promise<void> => {
    const entries = await safeFs.readDirectory(root, currentDirectory);
    if (!entries.ok) {
      if (reportFailure || entries.diagnostic.code === "limit_exceeded") {
        const diagnostic = safeFsDiagnostic(agent, { rootId, relativePath: currentDirectory }, entries);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
      }
      return;
    }
    for (const name of entries.entries) {
      if (name.startsWith(".") || name === "SKILL.md") continue;
      const relativePath = `${currentDirectory}/${name}`;
      if (isRoot && options.flatMarkdownFiles === true && name.endsWith(".md")) {
        const skill = await safeFs.readText(root, relativePath);
        if (skill.ok) {
          addSkill(skill.text, { rootId, relativePath }, name.slice(0, -3));
          continue;
        }
        if (skill.diagnostic.code === "limit_exceeded") {
          const diagnostic = safeFsDiagnostic(agent, { rootId, relativePath }, skill);
          if (diagnostic !== undefined) diagnostics.push(diagnostic);
          return;
        }
      }

      const source = { rootId, relativePath: `${relativePath}/SKILL.md` };
      const skill = await safeFs.readText(root, source.relativePath);
      if (skill.ok) addSkill(skill.text, source, name);
      else if (skill.diagnostic.code === "limit_exceeded") {
        const diagnostic = safeFsDiagnostic(agent, source, skill);
        if (diagnostic !== undefined) diagnostics.push(diagnostic);
        return;
      }

      if (options.recursive === true) await scanDirectory(relativePath, false, false);
    }
  };

  await scanDirectory(directory, true, true);
};
