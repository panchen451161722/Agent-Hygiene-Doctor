import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runRemoveAsync, type RemoveSelection } from "../../../src/cli/manage.js";
import { OperationStore } from "../../../src/manage/operation-store.js";
import { scanForManagement } from "../../../src/manage/scan.js";

const directories: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-hygiene-codex-shortcut-"));
  directories.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  const skill = join(home, ".agents", "skills", "demo");
  const codexHome = join(home, ".codex");
  const config = join(codexHome, "config.toml");
  await mkdir(skill, { recursive: true });
  await mkdir(project, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(skill, "SKILL.md"), "---\nname: demo\n---\nDemo\n");
  await writeFile(config, "[mcp_servers.keep]\ncommand = \"node\"\n\n[mcp_servers.drop]\ncommand = \"node\"\n");
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("LOCALAPPDATA", join(root, "local"));
  vi.stubEnv("CODEX_HOME", codexHome);
  const scan = await scanForManagement({ agents: ["codex"], project, environment: process.env });
  const ids = scan.report.inventory.filter((item) => (item.kind === "skill" && item.name === "demo") || (item.kind === "mcp" && item.name === "drop")).map((item) => item.itemId);
  expect(ids).toHaveLength(2);
  return { project, skill, config, ids };
};

const runtime = () => {
  let stdout = "";
  let stderr = "";
  return { runtime: { writeStdout: (text: string) => { stdout += text; }, writeStderr: (text: string) => { stderr += text; } }, output: () => ({ stdout, stderr }) };
};

describe.sequential("Codex single-step removal shortcut", () => {
  it("plans and applies selected Codex items in one process", async () => {
    const subject = await fixture();
    const captured = runtime();
    const select: RemoveSelection = async (options) => {
      expect(options.agents).toEqual(["codex"]);
      expect(options.codexShortcut).toBe(true);
      return subject.ids;
    };
    await expect(runRemoveAsync(["--codex", "--project", subject.project], captured.runtime, select)).resolves.toBe(0);
    expect(captured.output().stderr).toBe("");
    expect(captured.output().stdout).toContain("Quarantined 2 item(s).");
    expect(captured.output().stdout).toContain("Restore: ahd restore ");
    await expect(readFile(join(subject.skill, "SKILL.md"), "utf8")).rejects.toThrow();
    await expect(readFile(subject.config, "utf8")).resolves.not.toContain("mcp_servers.drop");
    await expect(new OperationStore().list()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ status: "applied", itemCount: 2 })]));
  });

  it("leaves selected Codex files untouched in dry-run mode", async () => {
    const subject = await fixture();
    const captured = runtime();
    await expect(runRemoveAsync(["--codex", "--project", subject.project, "--dry-run"], captured.runtime, async () => subject.ids)).resolves.toBe(0);
    expect(captured.output().stdout).toContain("Dry run: no files changed");
    await expect(readFile(join(subject.skill, "SKILL.md"), "utf8")).resolves.toContain("Demo");
    await expect(readFile(subject.config, "utf8")).resolves.toContain("mcp_servers.drop");
  });

  it("refuses the shortcut outside a real terminal", async () => {
    const captured = runtime();
    await expect(runRemoveAsync(["--codex"], captured.runtime)).resolves.toBe(2);
    expect(captured.output().stdout).toBe("");
    expect(captured.output().stderr).toContain("AH-REMOVE-INVALID-ITEM");
  });
  it("rejects conflicting shortcut arguments before selection", async () => {
    for (const argv of [["--codex", "--agent", "codex"], ["--codex", "--item", "demo"], ["--codex", "--format", "json"], ["--codex", "--agent-mode"], ["123e4567-e89b-42d3-a456-426614174000", "--yes", "--codex"]]) {
      const captured = runtime();
      await expect(runRemoveAsync(argv, captured.runtime, async () => { throw new Error("selection must not run"); })).resolves.toBe(2);
      expect(captured.output().stderr).toContain("AH-REMOVE-INVALID-ITEM");
    }
  });
});
