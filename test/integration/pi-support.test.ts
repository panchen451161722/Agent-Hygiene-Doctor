import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OperationStore } from "../../src/manage/operation-store.js";
import { planRemoval } from "../../src/manage/planner.js";
import { applyRemoval, restoreRemoval } from "../../src/manage/transaction.js";
import { scanLocal } from "../../src/scan/local.js";

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-hygiene-pi-"));
  directories.push(root);
  const home = join(root, "home");
  const piHome = join(home, ".pi", "agent");
  const project = join(root, "project");
  const flatSkill = join(piHome, "skills", "review.md");
  const body = "---\nname: review\ndescription: Review code\n---\nprivate-pi-skill-body";
  await mkdir(join(piHome, "skills", "nested", "lint"), { recursive: true });
  await mkdir(join(home, ".agents", "skills", "shared"), { recursive: true });
  await mkdir(join(project, ".pi", "skills"), { recursive: true });
  await mkdir(join(project, ".pi", "extensions"), { recursive: true });
  await writeFile(join(piHome, "settings.json"), "// Pi accepts JSONC\n{\"defaultProjectTrust\":\"always\"}\n");
  await writeFile(flatSkill, body);
  await writeFile(join(piHome, "skills", "nested", "lint", "SKILL.md"), "---\nname: lint\ndescription: Lint code\n---\nprivate-nested-body");
  await writeFile(join(piHome, "skills", "nested", "ignored.md"), "not a top-level Pi skill");
  await writeFile(join(home, ".agents", "skills", "ignored.md"), "not an Agent Skills skill");
  await writeFile(join(home, ".agents", "skills", "shared", "SKILL.md"), "---\nname: shared\ndescription: Shared skill\n---\nprivate-shared-body");
  await writeFile(join(project, "AGENTS.md"), "project rules");
  await writeFile(join(project, ".pi", "settings.json"), "{}");
  await writeFile(join(project, ".pi", "skills", "project.md"), "---\nname: project\ndescription: Project skill\n---\nprivate-project-body");
  await writeFile(join(project, ".pi", "extensions", "audit.ts"), "export default () => undefined");
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("PI_CODING_AGENT_DIR", piHome);
  return { root, home, piHome, project, flatSkill, body };
};

describe.sequential("Pi adapter support", () => {
  it("discovers Pi's JSONC settings, trusted project resources, recursive skills, flat skills, and extensions", async () => {
    const fixture = await createFixture();
    const { report } = await scanLocal({ agents: ["pi"], project: fixture.project, environment: process.env });

    expect(report.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "configuration", source: { rootId: "pi-home", relativePath: "settings.json" }, status: "active", facts: expect.objectContaining({ format: "json", parseStatus: "valid", precedence: 1 }) }),
      expect.objectContaining({ kind: "instruction", source: { rootId: "project", relativePath: "AGENTS.md" }, status: "active", loading: "always" }),
      expect.objectContaining({ kind: "configuration", source: { rootId: "project", relativePath: ".pi/settings.json" }, status: "active", loading: "conditional", facts: expect.objectContaining({ precedence: 2 }) }),
      expect.objectContaining({ kind: "skill", name: "lint", source: { rootId: "pi-home", relativePath: "skills/nested/lint/SKILL.md" }, loading: "lazy" }),
      expect.objectContaining({ kind: "skill", name: "review", source: { rootId: "pi-home", relativePath: "skills/review.md" }, loading: "lazy" }),
      expect.objectContaining({ kind: "skill", name: "shared", source: { rootId: "home", relativePath: ".agents/skills/shared/SKILL.md" }, loading: "lazy" }),
      expect.objectContaining({ kind: "skill", name: "project", source: { rootId: "project", relativePath: ".pi/skills/project.md" }, status: "active", loading: "conditional" }),
      expect.objectContaining({ kind: "hook", name: "audit.ts", source: { rootId: "project", relativePath: ".pi/extensions/audit.ts" }, status: "active", loading: "conditional" }),
    ]));
    expect(report.diagnostics).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("private-pi-skill-body");
    expect(JSON.stringify(report)).not.toContain("private-nested-body");
    expect(JSON.stringify(report)).not.toContain("private-project-body");
    expect(report.inventory).not.toContainEqual(expect.objectContaining({ source: { rootId: "pi-home", relativePath: "skills/nested/ignored.md" } }));
    expect(report.inventory).not.toContainEqual(expect.objectContaining({ source: { rootId: "home", relativePath: ".agents/skills/ignored.md" } }));
  });

  it("quarantines and restores a top-level Pi Markdown skill", async () => {
    const fixture = await createFixture();
    const scan = await scanLocal({ agents: ["pi"], project: fixture.project, environment: process.env });
    const skill = scan.report.inventory.find((item) => item.agent === "pi" && item.kind === "skill" && item.source.relativePath === "skills/review.md");
    expect(skill).toBeDefined();
    const store = new OperationStore(join(fixture.root, "quarantine"));
    const operation = await planRemoval({ itemIds: [skill!.itemId], agents: ["pi"], project: fixture.project, environment: process.env, store });

    expect(operation.targets).toEqual([expect.objectContaining({ agent: "pi", skillStorage: "file" })]);
    await expect(applyRemoval(store, operation.operationId)).resolves.toMatchObject({ status: "applied" });
    await expect(readFile(fixture.flatSkill, "utf8")).rejects.toThrow();
    await expect(restoreRemoval(store, operation.operationId)).resolves.toMatchObject({ status: "restored" });
    await expect(readFile(fixture.flatSkill, "utf8")).resolves.toBe(fixture.body);
  });
});
