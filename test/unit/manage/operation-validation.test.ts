import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { OPERATION_SCHEMA_VERSION, type RemovalOperation } from "../../../src/manage/model.js";
import { OperationStore } from "../../../src/manage/operation-store.js";

const directories: string[] = [];
const operation = (): RemovalOperation => ({
  schemaVersion: OPERATION_SCHEMA_VERSION,
  operationId: "123e4567-e89b-42d3-a456-426614174000",
  toolVersion: "1.1.0",
  createdAt: "2026-07-13T00:00:00.000Z",
  status: "planned",
  targets: [{ itemId: "item", agent: "codex", kind: "skill", name: "demo", scope: "user", source: { rootId: "home", relativePath: ".agents/skills/demo/SKILL.md" }, absolutePath: "C:/private/demo", rootPath: "C:/private", preImageHash: "a".repeat(64), plannedPostImageHash: "b".repeat(64), backupPath: "backups/skill-0001" }],
});
const makeStore = async (): Promise<OperationStore> => {
  const root = await mkdtemp(join(tmpdir(), "agent-hygiene-operation-validation-"));
  directories.push(root);
  return new OperationStore(root);
};
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("operation manifest boundary", () => {
  it("persists an initial private journal before exposing a valid manifest", async () => {
    const store = await makeStore();
    const value = operation();
    await store.create(value);
    await expect(store.loadJournal(value.operationId)).resolves.toMatchObject({ status: "planned", attemptedTargetKeys: [], appliedTargetKeys: [], restoredTargetKeys: [] });
  });

  it("rejects unknown manifest fields instead of executing an unclosed record", async () => {
    const store = await makeStore();
    const value = operation();
    await store.create(value);
    await writeFile(store.manifestPath(value.operationId), `${JSON.stringify({ ...value, unexpected: "unsafe" })}\n`);
    await expect(store.load(value.operationId)).rejects.toMatchObject({ code: "AH-REMOVE-OPERATION" });
  });
});
