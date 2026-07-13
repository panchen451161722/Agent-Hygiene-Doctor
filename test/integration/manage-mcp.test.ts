import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OperationStore } from "../../src/manage/operation-store.js";
import { planRemoval } from "../../src/manage/planner.js";
import { scanForManagement } from "../../src/manage/scan.js";
import { applyRemoval, restoreRemoval } from "../../src/manage/transaction.js";

const directories: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe.sequential("recoverable MCP removal", () => {
  it("applies one TOML source edit and restores its original bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-hygiene-mcp-"));
    directories.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    const config = join(project, ".codex", "config.toml");
    const original = "# retain\n[mcp_servers.keep]\ncommand = \"node\"\n\n[mcp_servers.drop]\ncommand = \"node\"\n";
    await mkdir(dirname(config), { recursive: true });
    await writeFile(config, original);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("CODEX_HOME", join(home, ".codex"));
    const scan = await scanForManagement({ agents: ["codex"], project, environment: process.env });
    const drop = scan.report.inventory.find((item) => item.kind === "mcp" && item.name === "drop");
    expect(drop).toBeDefined();
    const store = new OperationStore(join(root, "quarantine"));
    const operation = await planRemoval({ itemIds: [drop!.itemId], agents: ["codex"], project, environment: process.env, store });
    await applyRemoval(store, operation.operationId);
    await expect(readFile(config, "utf8")).resolves.toContain("mcp_servers.keep");
    await expect(readFile(config, "utf8")).resolves.not.toContain("mcp_servers.drop");
    await restoreRemoval(store, operation.operationId);
    await expect(readFile(config, "utf8")).resolves.toBe(original);
  });
});
