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

const createMcpFixture = async () => {
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
  return { config, original, store, operation };
};
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
  it("refuses MCP restore when the post-image was modified", async () => {
    const fixture = await createMcpFixture();
    await applyRemoval(fixture.store, fixture.operation.operationId);
    await writeFile(fixture.config, "[mcp_servers.user]\ncommand = \"custom\"\n");

    await expect(restoreRemoval(fixture.store, fixture.operation.operationId)).rejects.toMatchObject({ code: "AH-REMOVE-RESTORE-CONFLICT" });
    await expect(readFile(fixture.config, "utf8")).resolves.toBe("[mcp_servers.user]\ncommand = \"custom\"\n");
  });

  it("refuses MCP restore when the post-image was deleted", async () => {
    const fixture = await createMcpFixture();
    await applyRemoval(fixture.store, fixture.operation.operationId);
    await rm(fixture.config);

    await expect(restoreRemoval(fixture.store, fixture.operation.operationId)).rejects.toMatchObject({ code: "AH-REMOVE-RESTORE-CONFLICT" });
    await expect(readFile(fixture.config, "utf8")).rejects.toThrow();
  });
  it("edits an approved Claude JSONC source and restores its exact bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-hygiene-mcp-jsonc-"));
    directories.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    const config = join(project, ".mcp.json");
    const original = '{\n  // retain this comment\n  "mcpServers": {\n    "keep": { "command": "node" },\n    "drop": { "command": "node", "env": { "TOKEN": "SUPER_SECRET" } }\n  }\n}\n';
    await mkdir(project, { recursive: true });
    await writeFile(config, original);
    await mkdir(home, { recursive: true });
    await writeFile(join(home, ".claude.json"), JSON.stringify({ projects: { [project]: { hasTrustDialogAccepted: true } } }));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(home, ".claude"));
    const scan = await scanForManagement({ agents: ["claude"], project, environment: process.env });
    const drop = scan.report.inventory.find((item) => item.kind === "mcp" && item.name === "drop");
    expect(drop).toBeDefined();
    const store = new OperationStore(join(root, "quarantine"));
    const operation = await planRemoval({ itemIds: [drop!.itemId], agents: ["claude"], project, environment: process.env, store });
    await applyRemoval(store, operation.operationId);
    await expect(readFile(config, "utf8")).resolves.toContain("// retain this comment");
    await expect(readFile(config, "utf8")).resolves.not.toContain('"drop"');
    await restoreRemoval(store, operation.operationId);
    await expect(readFile(config, "utf8")).resolves.toBe(original);
  });

  it("edits a Hermes YAML source and restores its exact bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-hygiene-mcp-yaml-"));
    directories.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    const hermesHome = join(home, ".hermes");
    const config = join(hermesHome, "config.yaml");
    const original = "mcp_servers:\n  keep: # keep comment\n    command: node\n  drop:\n    command: node\nother: true\n";
    await mkdir(hermesHome, { recursive: true });
    await mkdir(project, { recursive: true });
    await writeFile(config, original);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("HERMES_HOME", hermesHome);
    const scan = await scanForManagement({ agents: ["hermes"], project, environment: process.env });
    const drop = scan.report.inventory.find((item) => item.kind === "mcp" && item.name === "drop");
    expect(drop).toBeDefined();
    const store = new OperationStore(join(root, "quarantine"));
    const operation = await planRemoval({ itemIds: [drop!.itemId], agents: ["hermes"], project, environment: process.env, store });
    await applyRemoval(store, operation.operationId);
    await expect(readFile(config, "utf8")).resolves.toContain("keep: # keep comment");
    await expect(readFile(config, "utf8")).resolves.not.toContain("drop:");
    await restoreRemoval(store, operation.operationId);
    await expect(readFile(config, "utf8")).resolves.toBe(original);
  });

  it("removes multiple MCPs from one TOML source as one source mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-hygiene-mcp-batch-"));
    directories.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    const config = join(project, ".codex", "config.toml");
    const original = "[mcp_servers.keep]\ncommand = \"node\"\n\n[mcp_servers.drop_one]\ncommand = \"node\"\n\n[mcp_servers.drop_two]\ncommand = \"node\"\n";
    await mkdir(dirname(config), { recursive: true });
    await writeFile(config, original);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("CODEX_HOME", join(home, ".codex"));
    const scan = await scanForManagement({ agents: ["codex"], project, environment: process.env });
    const itemIds = scan.report.inventory.filter((item) => item.kind === "mcp" && (item.name === "drop_one" || item.name === "drop_two")).map((item) => item.itemId);
    expect(itemIds).toHaveLength(2);
    const store = new OperationStore(join(root, "quarantine"));
    const operation = await planRemoval({ itemIds, agents: ["codex"], project, environment: process.env, store });
    expect(new Set(operation.targets.map((target) => target.backupPath))).toHaveLength(1);
    await applyRemoval(store, operation.operationId);
    await expect(readFile(config, "utf8")).resolves.toContain("mcp_servers.keep");
    await expect(readFile(config, "utf8")).resolves.not.toContain("drop_one");
    await expect(readFile(config, "utf8")).resolves.not.toContain("drop_two");
    await restoreRemoval(store, operation.operationId);
    await expect(readFile(config, "utf8")).resolves.toBe(original);
  });

  it("refuses a managed Claude MCP even when it is active", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-hygiene-mcp-managed-"));
    directories.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    const claudeHome = join(home, ".claude");
    await mkdir(claudeHome, { recursive: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(claudeHome, "managed-settings.json"), '{"mcpServers":{"managed":{"command":"node"}}}');
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("CLAUDE_CONFIG_DIR", claudeHome);
    const scan = await scanForManagement({ agents: ["claude"], project, environment: process.env });
    const managed = scan.report.inventory.find((item) => item.kind === "mcp" && item.name === "managed");
    expect(managed).toMatchObject({ scope: "managed", status: "active" });
    await expect(planRemoval({ itemIds: [managed!.itemId], agents: ["claude"], project, environment: process.env, store: new OperationStore(join(root, "quarantine")) })).rejects.toMatchObject({ code: "AH-REMOVE-REFUSED" });
  });
});
