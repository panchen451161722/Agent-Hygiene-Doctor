import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { OPERATION_SCHEMA_VERSION, type RemovalOperation } from "../../../src/manage/model.js";
import { OperationStore } from "../../../src/manage/operation-store.js";

const directories: string[] = [];
const makeStore = async (): Promise<OperationStore> => {
  const directory = await mkdtemp(join(tmpdir(), "agent-hygiene-operation-"));
  directories.push(directory);
  return new OperationStore(directory);
};
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("OperationStore", () => {
  it("lists only safe public operation fields", async () => {
    const store = await makeStore();
    const operation: RemovalOperation = {
      schemaVersion: OPERATION_SCHEMA_VERSION, operationId: "123e4567-e89b-42d3-a456-426614174000", toolVersion: "0.1.0", createdAt: "2026-07-13T00:00:00.000Z", status: "planned",
      targets: [{ itemId: "item", agent: "codex", kind: "skill", name: "demo", scope: "user", source: { rootId: "home", relativePath: ".agents/skills/demo/SKILL.md" }, absolutePath: "C:/private/demo", rootPath: "C:/private", preImageHash: "a".repeat(64), plannedPostImageHash: "b".repeat(64), backupPath: "backups/skill-0001" }],
    };
    await store.create(operation);
    await expect(store.load(operation.operationId)).resolves.toEqual(operation);
    await expect(store.list()).resolves.toEqual([{ operationId: operation.operationId, createdAt: operation.createdAt, status: "planned", itemCount: 1, items: [{ agent: "codex", kind: "skill", name: "demo", scope: "user", source: operation.targets[0]!.source }] }]);
  });
});
