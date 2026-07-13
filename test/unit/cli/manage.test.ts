import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCliAsync } from "../../../src/cli/main.js";
import { OPERATION_SCHEMA_VERSION, type RemovalOperation } from "../../../src/manage/model.js";
import { OperationStore, quarantineRoot } from "../../../src/manage/operation-store.js";

const directories: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("management CLI safety gates", () => {
  it("requires --yes to execute a removal operation", async () => {
    let stdout = "";
    let stderr = "";
    await expect(runCliAsync(["remove", "123e4567-e89b-42d3-a456-426614174000"], { writeStdout: (text) => { stdout += text; }, writeStderr: (text) => { stderr += text; } })).resolves.toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("AH-REMOVE-CONFIRMATION");
  });

  it("requires --yes to restore an operation", async () => {
    let stderr = "";
    await expect(runCliAsync(["restore", "123e4567-e89b-42d3-a456-426614174000"], { writeStdout: () => undefined, writeStderr: (text) => { stderr += text; } })).resolves.toBe(2);
    expect(stderr).toContain("AH-REMOVE-CONFIRMATION");
  });
  it("refuses interactive selection when standard input is not a terminal", async () => {
    let stdout = "";
    let stderr = "";
    await expect(runCliAsync(["remove", "--agent", "codex"], { writeStdout: (text) => { stdout += text; }, writeStderr: (text) => { stderr += text; } })).resolves.toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("AH-REMOVE-INVALID-ITEM");
  });

  it("does not execute an unknown operation ID", async () => {
    let stdout = "";
    let stderr = "";
    await expect(runCliAsync(["remove", "f2c5f413-47f0-4c52-8a49-7b1aaf3b62d4", "--yes"], { writeStdout: (text) => { stdout += text; }, writeStderr: (text) => { stderr += text; } })).resolves.toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("AH-REMOVE-OPERATION");
  });
  it("does not expose private paths, secrets, or terminal controls in operation output", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-hygiene-cli-output-"));
    directories.push(home);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("LOCALAPPDATA", home);
    const operation: RemovalOperation = {
      schemaVersion: OPERATION_SCHEMA_VERSION,
      operationId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      toolVersion: "1.1.0",
      createdAt: "2026-07-13T00:00:00.000Z",
      status: "planned",
      targets: [{ itemId: "demo", agent: "codex", kind: "skill", name: "demo\u001b[31m", scope: "user", source: { rootId: "home", relativePath: ".agents/skills/demo/SKILL.md" }, absolutePath: join(home, "private", "SUPER_SECRET"), rootPath: join(home, "private"), preImageHash: "a".repeat(64), plannedPostImageHash: "b".repeat(64), backupPath: "backups/skill-0001" }],
    };
    await new OperationStore(quarantineRoot()).create(operation);
    let stdout = "";
    await expect(runCliAsync(["operations"], { writeStdout: (text) => { stdout += text; }, writeStderr: () => undefined })).resolves.toBe(0);
    expect(stdout).not.toContain(home);
    expect(stdout).not.toContain("SUPER_SECRET");
    expect(stdout).not.toContain("\u001b");
    expect(stdout).toContain("demo�[31m");
  });
});
