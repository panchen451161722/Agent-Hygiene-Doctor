import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OperationStore } from "../../src/manage/operation-store.js";
import { planRemoval } from "../../src/manage/planner.js";
import { scanForManagement } from "../../src/manage/scan.js";
import { applyRemoval, restoreRemoval } from "../../src/manage/transaction.js";

const directories: string[] = [];
const makeFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-hygiene-skill-"));
  directories.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  const skill = join(home, ".agents", "skills", "demo");
  await mkdir(join(skill, "resources"), { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(skill, "SKILL.md"), "---\nname: demo\n---\nDemo skill\n");
  await writeFile(join(skill, "resources", "data.txt"), "resource\n");
  return { root, home, project, skill };
};
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe.sequential("recoverable skill removal", () => {
  it("quarantines and restores a selected skill directory", async () => {
    const fixture = await makeFixture();
    vi.stubEnv("HOME", fixture.home);
    vi.stubEnv("USERPROFILE", fixture.home);
    vi.stubEnv("CODEX_HOME", join(fixture.home, ".codex"));
    const scan = await scanForManagement({ agents: ["codex"], project: fixture.project, environment: process.env });
    const item = scan.report.inventory.find((entry) => entry.kind === "skill" && entry.name === "demo");
    expect(item).toBeDefined();
    const store = new OperationStore(join(fixture.root, "quarantine"));
    const operation = await planRemoval({ itemIds: [item!.itemId], agents: ["codex"], project: fixture.project, environment: process.env, store });
    await expect(applyRemoval(store, operation.operationId)).resolves.toMatchObject({ status: "applied" });
    await expect(readFile(join(fixture.skill, "SKILL.md"), "utf8")).rejects.toThrow();
    await expect(restoreRemoval(store, operation.operationId)).resolves.toMatchObject({ status: "restored" });
    await expect(readFile(join(fixture.skill, "resources", "data.txt"), "utf8")).resolves.toBe("resource\n");
  });

  it("refuses restore when the removed location was recreated", async () => {
    const fixture = await makeFixture();
    vi.stubEnv("HOME", fixture.home);
    vi.stubEnv("USERPROFILE", fixture.home);
    vi.stubEnv("CODEX_HOME", join(fixture.home, ".codex"));
    const scan = await scanForManagement({ agents: ["codex"], project: fixture.project, environment: process.env });
    const item = scan.report.inventory.find((entry) => entry.kind === "skill" && entry.name === "demo");
    const store = new OperationStore(join(fixture.root, "quarantine"));
    const operation = await planRemoval({ itemIds: [item!.itemId], agents: ["codex"], project: fixture.project, environment: process.env, store });
    await applyRemoval(store, operation.operationId);
    await mkdir(fixture.skill, { recursive: true });
    await expect(restoreRemoval(store, operation.operationId)).rejects.toMatchObject({ code: "AH-REMOVE-RESTORE-CONFLICT" });
  });
});
