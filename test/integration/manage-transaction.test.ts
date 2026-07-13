import { promises as nodeFs } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OperationStore } from "../../src/manage/operation-store.js";
import { planRemoval } from "../../src/manage/planner.js";
import { scanForManagement } from "../../src/manage/scan.js";
import { applyRemoval, restoreRemoval } from "../../src/manage/transaction.js";

const directories: string[] = [];
const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-hygiene-transaction-"));
  directories.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  const createSkill = async (name: string) => {
    const directory = join(home, ".agents", "skills", name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\n---\n${name}\n`);
    return directory;
  };
  const first = await createSkill("alpha");
  const second = await createSkill("zeta");
  await mkdir(project, { recursive: true });
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("CODEX_HOME", join(home, ".codex"));
  const scan = await scanForManagement({ agents: ["codex"], project, environment: process.env });
  const itemIds = scan.report.inventory.filter((item) => item.kind === "skill" && (item.name === "alpha" || item.name === "zeta")).map((item) => item.itemId);
  const store = new OperationStore(join(root, "quarantine"));
  const operation = await planRemoval({ itemIds, agents: ["codex"], project, environment: process.env, store });
  return { root, project, first, second, store, operation };
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe.sequential("removal transactions", () => {
  it("rolls back only changed targets when a later skill deletion fails", async () => {
    const fixture = await createFixture();
    const originalRmdir = nodeFs.rmdir;
    let injected = false;
    vi.spyOn(nodeFs, "rmdir").mockImplementation(async (path, options) => {
      if (String(path) === fixture.second && !injected) {
        injected = true;
        throw new Error("injected failure");
      }
      return originalRmdir(path, options);
    });

    await expect(applyRemoval(fixture.store, fixture.operation.operationId)).rejects.toMatchObject({ code: "AH-REMOVE-STALE" });
    await expect(readFile(join(fixture.first, "SKILL.md"), "utf8")).resolves.toContain("alpha");
    await expect(readFile(join(fixture.second, "SKILL.md"), "utf8")).resolves.toContain("zeta");
    await expect(fixture.store.load(fixture.operation.operationId)).resolves.toMatchObject({ status: "rolled_back" });
  });

  it("preflights every restore target before changing any target", async () => {
    const fixture = await createFixture();
    await applyRemoval(fixture.store, fixture.operation.operationId);
    await mkdir(fixture.second, { recursive: true });
    await writeFile(join(fixture.second, "SKILL.md"), "user replacement\n");

    await expect(restoreRemoval(fixture.store, fixture.operation.operationId)).rejects.toMatchObject({ code: "AH-REMOVE-RESTORE-CONFLICT" });
    await expect(readFile(join(fixture.first, "SKILL.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(fixture.second, "SKILL.md"), "utf8")).resolves.toBe("user replacement\n");
  });
});
