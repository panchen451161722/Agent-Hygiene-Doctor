import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { assertMcpPresent, removeMcpFromText } from "./mcp-editor.js";
import { assertNoLinksAlongPath, assertRegularFile, copyDirectoryChecked, hashDirectory, hashFile, removeDirectoryChecked, writeAtomic } from "./mutation.js";
import { absentHash, type OperationStore } from "./operation-store.js";
import { type RemovalOperation, type OperationTarget, RemovalError } from "./model.js";
import { scanForManagement } from "./scan.js";

const targetKey = (target: OperationTarget): string => `${target.kind}:${target.absolutePath}`;
const backupPath = (store: OperationStore, operation: RemovalOperation, target: OperationTarget): string => join(store.operationDirectory(operation.operationId), target.backupPath);

const currentHash = async (target: OperationTarget): Promise<string> => { await assertNoLinksAlongPath(target.rootPath, target.absolutePath); return target.kind === "skill" ? hashDirectory(target.absolutePath) : hashFile(target.absolutePath); };
const assertMissing = async (path: string): Promise<void> => {
  if (await fs.lstat(path).catch(() => undefined) !== undefined) throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
};

const verifyInventory = async (operation: RemovalOperation): Promise<void> => {
  const agents = [...new Set(operation.targets.map((target) => target.agent))];
  const scanned = await scanForManagement({ agents, ...(operation.projectDirectory === undefined ? {} : { project: operation.projectDirectory }) });
  for (const target of operation.targets) {
    const item = scanned.report.inventory.find((candidate) => candidate.itemId === target.itemId);
    if (item === undefined || item.kind !== target.kind || item.name !== target.name || item.scope !== target.scope || item.source.rootId !== target.source.rootId || item.source.relativePath !== target.source.relativePath) throw new RemovalError("AH-REMOVE-STALE");
  }
};

const verifyPreImages = async (operation: RemovalOperation): Promise<void> => {
  await verifyInventory(operation);
  for (const target of operation.targets) if (await currentHash(target) !== target.preImageHash) throw new RemovalError("AH-REMOVE-STALE");
};

const backupAll = async (store: OperationStore, operation: RemovalOperation): Promise<void> => {
  const completed = new Set<string>();
  for (const target of operation.targets) {
    const key = targetKey(target);
    if (completed.has(key)) continue;
    completed.add(key);
    const destination = backupPath(store, operation, target);
    await fs.mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    if (target.kind === "skill") await copyDirectoryChecked(target.absolutePath, destination);
    else { await assertRegularFile(target.absolutePath); await fs.copyFile(target.absolutePath, destination); await fs.chmod(destination, 0o600).catch(() => undefined); }
  }
};

const restoreSkill = async (source: string, backup: string): Promise<void> => {
  await assertMissing(source);
  await fs.mkdir(dirname(source), { recursive: true, mode: 0o700 });
  const temporary = `${source}.agent-hygiene-restore-${Date.now()}`;
  await copyDirectoryChecked(backup, temporary);
  await fs.rename(temporary, source);
};

const restoreBackups = async (store: OperationStore, operation: RemovalOperation, requirePostImage: boolean): Promise<void> => {
  const done = new Set<string>();
  for (const target of [...operation.targets].reverse()) {
    const key = targetKey(target);
    if (done.has(key)) continue;
    done.add(key);
    if (requirePostImage) {
      if (target.kind === "skill") {
        const exists = await fs.lstat(target.absolutePath).catch(() => undefined);
        if (exists !== undefined) throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
      } else if (await hashFile(target.absolutePath) !== target.plannedPostImageHash) throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
    }
    const backup = backupPath(store, operation, target);
    if (target.kind === "skill") await restoreSkill(target.absolutePath, backup);
    else await writeAtomic(target.absolutePath, await fs.readFile(backup));
  }
};

const applyMcpGroups = async (operation: RemovalOperation): Promise<void> => {
  const groups = new Map<string, OperationTarget[]>();
  for (const target of operation.targets.filter((item) => item.kind === "mcp")) {
    const items = groups.get(target.absolutePath) ?? [];
    items.push(target);
    groups.set(target.absolutePath, items);
  }
  for (const [path, targets] of groups) {
    let text = await fs.readFile(path, "utf8");
    for (const target of targets) {
      const locator = target.locator;
      if (locator === undefined) throw new RemovalError("AH-REMOVE-UNSUPPORTED");
      assertMcpPresent(text, locator.format, locator.key, locator.name);
      text = removeMcpFromText(text, locator.format, locator.key, locator.name);
    }
    const expected = targets[0]?.plannedPostImageHash;
    if (expected === undefined || (await import("node:crypto")).createHash("sha256").update(text).digest("hex") !== expected) throw new RemovalError("AH-REMOVE-STALE");
    await writeAtomic(path, Buffer.from(text, "utf8"));
  }
};

const verifyPostImages = async (operation: RemovalOperation): Promise<void> => {
  for (const target of operation.targets) {
    if (target.kind === "skill") {
      const stat = await fs.lstat(target.absolutePath).catch(() => undefined);
      if (stat !== undefined || target.plannedPostImageHash !== absentHash()) throw new RemovalError("AH-REMOVE-STALE");
    } else if (await currentHash(target) !== target.plannedPostImageHash) throw new RemovalError("AH-REMOVE-STALE");
  }
};

export const applyRemoval = async (store: OperationStore, operationId: string): Promise<RemovalOperation> => {
  const operation = await store.load(operationId);
  if (operation.status !== "planned") throw new RemovalError("AH-REMOVE-OPERATION");
  await verifyPreImages(operation);
  let applying = await store.setStatus(operation, "applying");
  try {
    await backupAll(store, applying);
    await applyMcpGroups(applying);
    for (const target of applying.targets.filter((item) => item.kind === "skill")) await removeDirectoryChecked(target.absolutePath);
    await verifyPostImages(applying);
    applying = await store.setStatus(applying, "applied", { appliedAt: new Date().toISOString() });
    return applying;
  } catch (error: unknown) {
    try { await restoreBackups(store, applying, false); }
    catch { applying = await store.setStatus(applying, "failed", { errorCode: "AH-REMOVE-STALE" }); throw new RemovalError("AH-REMOVE-STALE"); }
    await store.setStatus(applying, "rolled_back", { errorCode: error instanceof RemovalError ? error.code : "AH-REMOVE-STALE" });
    throw error instanceof RemovalError ? error : new RemovalError("AH-REMOVE-STALE");
  }
};

export const restoreRemoval = async (store: OperationStore, operationId: string): Promise<RemovalOperation> => {
  let operation = await store.load(operationId);
  if (operation.status !== "applied") throw new RemovalError("AH-REMOVE-OPERATION");
  operation = await store.setStatus(operation, "restoring");
  try {
    await restoreBackups(store, operation, true);
    for (const target of operation.targets) if (await currentHash(target) !== target.preImageHash) throw new RemovalError("AH-REMOVE-STALE");
    return await store.setStatus(operation, "restored", { restoredAt: new Date().toISOString() });
  } catch (error: unknown) {
    await store.setStatus(operation, "applied", { errorCode: error instanceof RemovalError ? error.code : "AH-REMOVE-RESTORE-CONFLICT" });
    throw error instanceof RemovalError ? error : new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
  }
};
