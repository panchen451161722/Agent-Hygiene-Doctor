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
}

/** One skill per immediate child. Agent-specific containers are selected by adapters. */
export const scanSkillDirectory = async (options: SkillDirectoryOptions): Promise<void> => {
  const { safeFs, root, rootId, directory, agent, scope, inventory, diagnostics } = options;
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
    const input = parseSkill(skill.text, source);
    const inspected = inspectSkill(input, { agent, source, scope, status: "active", loading: "lazy" });
    // A directory is a display fallback, not evidence of usable metadata.
    inventory.push({ ...inspected, name: input.name?.trim() ? inspected.name : name });
    if (input.frontmatter === "malformed") diagnostics.push({
      code: "parse_error", severity: "warning", agent, source,
      coverageImpact: "partial", message: DIAGNOSTIC_MESSAGES.parse_error,
    });
  }
};
