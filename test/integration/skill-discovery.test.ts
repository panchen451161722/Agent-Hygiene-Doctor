import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanLocal } from "../../src/scan/local.js";
import { parseSkill } from "../../src/adapters/shared/skills.js";
import { inspectSkill } from "../../src/inspectors/skill.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
const fixture = async () => {
  const home = await mkdtemp(join(tmpdir(), "ahd-skills-"));
  temporary.push(home);
  const project = join(home, "repo");
  await mkdir(project);
  const put = async (path: string, text: string) => {
    const target = join(home, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, text);
  };
  const scan = () => scanLocal({ agents: ["codex", "claude", "hermes"], project, environment: { HOME: home, USERPROFILE: home, LOCALAPPDATA: home, CODEX_HOME: join(home, ".codex"), CLAUDE_CONFIG_DIR: join(home, ".claude"), HERMES_HOME: join(home, ".hermes") } });
  return { home, put, scan };
};
const metadata = "---\nname: Actual Name\ndescription: >\n  A useful description.\n---\nprivate-body-sentinel";

describe("skill discovery with the real filesystem", () => {
  it("reads metadata across agents, discovers Codex project/system skills, and honors disabled paths", async () => {
    const { home, put, scan } = await fixture();
    for (const path of [".codex/skills/folder", ".claude/skills/folder", ".hermes/skills/folder", "repo/.agents/skills/project", ".agents/skills/user", ".codex/skills/.system/system"]) await put(`${path}/SKILL.md`, metadata);
    await put(".codex/config.toml", `[[skills.config]]\npath = ${JSON.stringify(join(home, ".codex/skills/folder/SKILL.md"))}\nenabled = false\n`);
    const { report } = await scan();
    const skills = report.inventory.filter((entry) => entry.kind === "skill");
    expect(skills).toHaveLength(6);
    for (const skill of skills) expect(skill).toMatchObject({ name: "actual name", loading: "lazy", facts: { frontmatter: "valid", nameUsable: true, descriptionUsable: true } });
    expect(skills.find((entry) => entry.source.relativePath === "skills/.system/system/SKILL.md")?.scope).toBe("managed");
    expect(skills.find((entry) => entry.agent === "codex" && entry.source.relativePath === "skills/folder/SKILL.md")?.status).toBe("disabled");
    expect(report.diagnostics).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("private-body-sentinel");
  });

  it("reports bad metadata and rejected links without reporting absent optional directories", async () => {
    const { home, put, scan } = await fixture();
    await put(".codex/skills/missing/SKILL.md", "No metadata");
    await put(".claude/skills/broken/SKILL.md", "---\nname: [broken\n---\n");
    await put("outside/SKILL.md", metadata);
    await symlink(join(home, "outside"), join(home, ".codex/skills/linked"), process.platform === "win32" ? "junction" : "dir");
    const { report } = await scan();
    expect(report.findings.filter((entry) => entry.ruleId === "skill-metadata-invalid")).toHaveLength(2);
    expect(report.diagnostics.map((entry) => entry.code).sort()).toEqual(["parse_error", "unsafe_reference"]);
    expect(report.inventory.filter((entry) => entry.kind === "skill").map((entry) => entry.name).sort()).toEqual(["broken", "missing"]);
  });

  it("parses BOM/CRLF and rejects empty or non-mapping metadata", () => {
    const source = { rootId: "project", relativePath: "SKILL.md" };
    expect(parseSkill(`\uFEFF${metadata.replace(/\n/g, "\r\n")}`, source)).toMatchObject({ name: "Actual Name", frontmatter: "valid" });
    expect(parseSkill("---\n- a\n---", source).frontmatter).toBe("malformed");
    expect(parseSkill("---\nname: unfinished", source).frontmatter).toBe("malformed");
    const skill = inspectSkill(parseSkill('---\nname: "  "\ndescription: ""\n---', source), { agent: "codex", source, scope: "project", status: "active", loading: "lazy" });
    expect(skill.facts).toMatchObject({ nameUsable: false, descriptionUsable: false });
  });
});
