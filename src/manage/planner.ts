import { dirname, join, relative, resolve } from "node:path";

import type { AgentId } from "../core/agent.js";
import type { InventoryItem } from "../core/inventory.js";
import { assertNoLinksAlongPath, hashDirectory, hashFile } from "./mutation.js";
import { assertMcpPresent, removeMcpFromText, type McpFormat, type McpKey } from "./mcp-editor.js";
import { createOperationId, OperationStore } from "./operation-store.js";
import { OPERATION_SCHEMA_VERSION, type ManageKind, type OperationTarget, type RemovalOperation, RemovalError } from "./model.js";
import { scanForManagement } from "./scan.js";

const TOOL_VERSION = "1.1.0";
const allowedStatus = new Set<InventoryItem["status"]>(["active", "disabled"]);
const isRelative = (path: string): boolean => path !== "." && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((part) => part === "" || part === "." || part === "..");
const contains = (root: string, target: string): boolean => {
  const value = relative(resolve(root), resolve(target));
  return value === "" || (!value.startsWith("..") && !value.includes("..\\") && !value.includes("../"));
};

export interface PlanRequest {
  readonly itemIds: readonly string[];
  readonly agents: readonly AgentId[];
  readonly project?: string;
  readonly store?: OperationStore;
  readonly environment?: NodeJS.ProcessEnv;
}

const userHome = (environment: NodeJS.ProcessEnv): string => process.platform === "win32" ? environment.USERPROFILE ?? environment.HOME ?? "." : environment.HOME ?? environment.USERPROFILE ?? ".";
export const sourceRoot = (rootId: string, project: string, environment: NodeJS.ProcessEnv): string | undefined => {
  const home = userHome(environment);
  switch (rootId) {
    case "project": return project;
    case "home": return home;
    case "codex-home": return environment.CODEX_HOME ?? join(home, ".codex");
    case "claude-home": return environment.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
    case "hermes-home": return environment.HERMES_HOME ?? (process.platform === "win32" ? join(environment.LOCALAPPDATA ?? join(home, "AppData", "Local"), "hermes") : join(home, ".hermes"));
    default: return undefined;
  }
};
const formatFor = (path: string): McpFormat | undefined => path.endsWith(".toml") ? "toml" : path.endsWith(".yaml") || path.endsWith(".yml") ? "yaml" : path.endsWith(".json") ? "json" : undefined;
const locatorFor = (item: InventoryItem): { readonly key: McpKey; readonly format: McpFormat } | undefined => {
  const format = formatFor(item.source.relativePath);
  if (format === undefined) return undefined;
  if (item.agent === "codex" && format === "toml" && (item.source.relativePath === "config.toml" || item.source.relativePath === ".codex/config.toml")) return { key: "mcp_servers", format };
  if (item.agent === "claude" && format === "json" && (item.source.relativePath === ".mcp.json" || item.source.relativePath === ".claude.json" || item.source.relativePath.endsWith("/settings.json") || item.source.relativePath.endsWith("/settings.local.json") || item.source.relativePath === "settings.json")) return { key: "mcpServers", format };
  if (item.agent === "hermes" && format === "yaml" && item.source.relativePath === "config.yaml") return { key: "mcp_servers", format };
  return undefined;
};
const skillAllowed = (item: InventoryItem): boolean =>
  (item.agent === "codex" && item.source.rootId === "home" && item.source.relativePath.startsWith(".agents/skills/")) ||
  (item.agent === "claude" && ((item.source.rootId === "project" && item.source.relativePath.startsWith(".claude/skills/")) || (item.source.rootId === "claude-home" && item.source.relativePath.startsWith("skills/")))) ||
  (item.agent === "hermes" && item.source.rootId === "hermes-home" && item.source.relativePath.startsWith("skills/"));

const selectItems = (inventory: readonly InventoryItem[], ids: readonly string[]): readonly InventoryItem[] => {
  if (ids.length === 0 || new Set(ids).size !== ids.length) throw new RemovalError("AH-REMOVE-INVALID-ITEM");
  const byId = new Map(inventory.map((item) => [item.itemId, item]));
  return ids.map((id) => {
    const item = byId.get(id);
    if (item === undefined) throw new RemovalError("AH-REMOVE-INVALID-ITEM");
    if ((item.kind !== "skill" && item.kind !== "mcp") || (item.scope !== "user" && item.scope !== "project") || !allowedStatus.has(item.status)) throw new RemovalError("AH-REMOVE-REFUSED");
    return item;
  });
};

export const planRemoval = async (request: PlanRequest): Promise<RemovalOperation> => {
  const environment = request.environment ?? process.env;
  const scanned = await scanForManagement({ agents: request.agents, ...(request.project === undefined ? {} : { project: request.project }), environment });
  const items = selectItems(scanned.report.inventory, request.itemIds);
  const preliminary: Array<{ readonly item: InventoryItem; readonly absolutePath: string; readonly rootPath: string; readonly kind: ManageKind; readonly preImageHash: string; readonly locator?: { readonly key: McpKey; readonly format: McpFormat; readonly name: string } }> = [];
  for (const item of items) {
    if (!isRelative(item.source.relativePath)) throw new RemovalError("AH-REMOVE-REFUSED");
    const root = sourceRoot(item.source.rootId, scanned.projectDirectory, environment);
    if (root === undefined) throw new RemovalError("AH-REMOVE-REFUSED");
    const sourcePath = resolve(root, ...item.source.relativePath.split("/"));
    if (!contains(root, sourcePath)) throw new RemovalError("AH-REMOVE-REFUSED");
    if (item.kind === "skill") {
      if (!skillAllowed(item) || !item.source.relativePath.endsWith("/SKILL.md")) throw new RemovalError("AH-REMOVE-REFUSED");
      const absolutePath = dirname(sourcePath);
      if (!contains(root, absolutePath)) throw new RemovalError("AH-REMOVE-REFUSED");
      await assertNoLinksAlongPath(root, absolutePath);
      preliminary.push({ item, absolutePath, rootPath: root, kind: "skill", preImageHash: await hashDirectory(absolutePath) });
    } else {
      const locator = locatorFor(item);
      if (locator === undefined) throw new RemovalError("AH-REMOVE-REFUSED");
      const text = await (await import("node:fs")).promises.readFile(sourcePath, "utf8").catch(() => { throw new RemovalError("AH-REMOVE-REFUSED"); });
      assertMcpPresent(text, locator.format, locator.key, item.name);
      await assertNoLinksAlongPath(root, sourcePath);
      preliminary.push({ item, absolutePath: sourcePath, rootPath: root, kind: "mcp", preImageHash: await hashFile(sourcePath), locator: { ...locator, name: item.name } });
    }
  }
  const mcpOutputs = new Map<string, string>();
  const mcpGroups = new Map<string, (typeof preliminary)[number][]>();
  for (const entry of preliminary.filter((candidate) => candidate.kind === "mcp")) {
    const entries = mcpGroups.get(entry.absolutePath) ?? [];
    entries.push(entry);
    mcpGroups.set(entry.absolutePath, entries);
  }
  for (const [path, entries] of mcpGroups) {
    let text = await (await import("node:fs")).promises.readFile(path, "utf8");
    for (const entry of entries) text = removeMcpFromText(text, entry.locator!.format, entry.locator!.key, entry.locator!.name);
    mcpOutputs.set(path, text);
  }
  const operationId = createOperationId();
  const backups = new Map<string, string>();
  let backupIndex = 0;
  const targets: OperationTarget[] = [];
  for (const entry of preliminary) {
    const backupPath = backups.get(entry.absolutePath) ?? `backups/${entry.kind === "skill" ? "skill" : "source"}-${String(++backupIndex).padStart(4, "0")}${entry.kind === "skill" ? "" : ".bin"}`;
    backups.set(entry.absolutePath, backupPath);
    targets.push({
      itemId: entry.item.itemId, agent: entry.item.agent, kind: entry.kind, name: entry.item.name, scope: entry.item.scope as "user" | "project",
      source: entry.item.source, absolutePath: entry.absolutePath, rootPath: entry.rootPath, preImageHash: entry.preImageHash,
      plannedPostImageHash: entry.kind === "skill" ? (await import("./operation-store.js")).absentHash() : await hashFileContent(mcpOutputs.get(entry.absolutePath) as string), backupPath,
      ...(entry.locator === undefined ? {} : { locator: { key: entry.locator.key, name: entry.locator.name, format: entry.locator.format } }),
    });
  }
  const operation: RemovalOperation = { schemaVersion: OPERATION_SCHEMA_VERSION, operationId, toolVersion: TOOL_VERSION, createdAt: new Date().toISOString(), status: "planned", projectDirectory: scanned.projectDirectory, targets };
  await (request.store ?? new OperationStore()).create(operation);
  return operation;
};

const hashFileContent = async (text: string): Promise<string> => (await import("node:crypto")).createHash("sha256").update(text).digest("hex");
