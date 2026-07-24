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
  const codexHome = join(home, ".codex");
  const skill = join(codexHome, "skills", "demo");
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

describe.sequential("agent-scoped single-step removal", () => {
  it("plans and applies interactively selected items in one process", async () => {
    const subject = await fixture();
    const captured = runtime();
    const select: RemoveSelection = async (options) => {
      expect(options.agents).toEqual(["codex"]);
      return subject.ids;
    };
    await expect(runRemoveAsync(["--agent", "codex", "--project", subject.project], captured.runtime, select)).resolves.toBe(0);
    expect(captured.output().stderr).toBe("");
    expect(captured.output().stdout).toContain("Quarantined 2 item(s).");
    expect(captured.output().stdout).toContain("Restore: ahd restore ");
    await expect(readFile(join(subject.skill, "SKILL.md"), "utf8")).rejects.toThrow();
    await expect(readFile(subject.config, "utf8")).resolves.not.toContain("mcp_servers.drop");
    await expect(new OperationStore().list()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ status: "applied", itemCount: 2 })]));
  });

  it("leaves selected files untouched in dry-run mode", async () => {
    const subject = await fixture();
    const captured = runtime();
    await expect(runRemoveAsync(["--agent", "codex", "--project", subject.project, "--dry-run"], captured.runtime, async () => subject.ids)).resolves.toBe(0);
    expect(captured.output().stdout).toContain("Dry run: no files changed");
    await expect(readFile(join(subject.skill, "SKILL.md"), "utf8")).resolves.toContain("Demo");
    await expect(readFile(subject.config, "utf8")).resolves.toContain("mcp_servers.drop");
  });

  it("cancels every agent prompt without creating a plan", async () => {
    for (const agent of ["codex", "claude", "hermes"] as const) {
      const captured = runtime();
      await expect(runRemoveAsync(["--agent", agent], captured.runtime, async (options) => {
        expect(options.agents).toEqual([agent]);
        return undefined;
      })).resolves.toBe(0);
      expect(captured.output()).toEqual({ stdout: "Cancelled.\n", stderr: "" });
    }
  });
  it("rejects the removed --codex shortcut before selection", async () => {
    const captured = runtime();
    await expect(runRemoveAsync(["--codex"], captured.runtime, async () => { throw new Error("selection must not run"); })).resolves.toBe(2);
    expect(captured.output().stderr).toContain("AH-REMOVE-INVALID-ITEM");
  });
});
