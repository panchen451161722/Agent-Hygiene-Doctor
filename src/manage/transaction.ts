import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { assertMcpPresent, removeMcpFromText } from "./mcp-editor.js";
import { assertNoLinksAlongPath, assertRegularFile, copyDirectoryChecked, hashDirectory, hashFile, removeDirectoryChecked, writeAtomic } from "./mutation.js";
import { absentHash, type OperationStore } from "./operation-store.js";
import { type RemovalOperation, type OperationTarget, RemovalError } from "./model.js";
import { scanForManagement } from "./scan.js";
import { sourceRoot } from "./planner.js";

const targetKey = (target: OperationTarget): string => `${target.kind}:${target.absolutePath}`;
const backupPath = (store: OperationStore, operation: RemovalOperation, target: OperationTarget): string => join(store.operationDirectory(operation.operationId), target.backupPath);
const currentHash = async (target: OperationTarget): Promise<string> => {
  await assertNoLinksAlongPath(target.rootPath, target.absolutePath);
  return target.kind === "skill" ? hashDirectory(target.absolutePath) : hashFile(target.absolutePath);
};
const sourceTargets = (targets: readonly OperationTarget[]): readonly OperationTarget[] => {
  const seen = new Set<string>();
  return targets.filter((target) => { const key = targetKey(target); if (seen.has(key)) return false; seen.add(key); return true; });
};
const configuredGroups = (targets: readonly OperationTarget[]): readonly (readonly OperationTarget[])[] => {
  const groups = new Map<string, OperationTarget[]>();
  for (const target of targets.filter((item) => item.kind === "mcp")) {
    const group = groups.get(target.absolutePath) ?? [];
    group.push(target);
    groups.set(target.absolutePath, group);
  }
  return [...groups.values()];
};
const selectedTargets = (operation: RemovalOperation, keys: readonly string[]): readonly OperationTarget[] => {
  const selected = new Set(keys);
  return operation.targets.filter((target) => selected.has(targetKey(target)));
};

const assertMissing = async (target: OperationTarget): Promise<void> => {
  await assertNoLinksAlongPath(target.rootPath, dirname(target.absolutePath));
  if (await fs.lstat(target.absolutePath).catch(() => undefined) !== undefined) throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
};

const verifyInventory = async (operation: RemovalOperation, expectedPresent: boolean): Promise<void> => {
  const agents = [...new Set(operation.targets.map((target) => target.agent))];
  const scanned = await scanForManagement({ agents, ...(operation.projectDirectory === undefined ? {} : { project: operation.projectDirectory }) });
  for (const target of operation.targets) {
    const item = scanned.report.inventory.find((candidate) => candidate.itemId === target.itemId);
    const root = sourceRoot(target.source.rootId, operation.projectDirectory ?? process.cwd(), process.env);
    const relativePath = target.source.relativePath;
    const resolvedSource = root === undefined || relativePath.length === 0 || relativePath.includes("\\") || relativePath.split("/").some((part) => part.length === 0 || part === "." || part === "..") ? undefined : resolve(root, ...relativePath.split("/"));
    const expectedPath = resolvedSource === undefined ? undefined : target.kind === "skill" ? dirname(resolvedSource) : resolvedSource;
    const pathMatches = root !== undefined && resolve(target.rootPath) === resolve(root) && expectedPath !== undefined && resolve(target.absolutePath) === expectedPath;
    if (!pathMatches) throw new RemovalError("AH-REMOVE-STALE");
    const identityMatches = item !== undefined && item.agent === target.agent && item.kind === target.kind && item.name === target.name && item.scope === target.scope && item.source.rootId === target.source.rootId && item.source.relativePath === target.source.relativePath;
    if (expectedPresent !== identityMatches) throw new RemovalError("AH-REMOVE-STALE");
  }
};

const verifyPreImages = async (operation: RemovalOperation): Promise<void> => {
  await verifyInventory(operation, true);
  for (const target of operation.targets) {
    let current: string;
    try { current = await currentHash(target); } catch { throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT"); }
    if (current !== target.preImageHash) throw new RemovalError("AH-REMOVE-STALE");
  }
};

const verifyPostImages = async (operation: RemovalOperation): Promise<void> => {
  for (const target of operation.targets) {
    if (target.kind === "skill") {
      if (await fs.lstat(target.absolutePath).catch(() => undefined) !== undefined || target.plannedPostImageHash !== absentHash()) throw new RemovalError("AH-REMOVE-STALE");
    } else if (await currentHash(target) !== target.plannedPostImageHash) throw new RemovalError("AH-REMOVE-STALE");
  }
  await verifyInventory(operation, false);
};

const backupAll = async (store: OperationStore, operation: RemovalOperation): Promise<void> => {
  for (const target of sourceTargets(operation.targets)) {
    const destination = backupPath(store, operation, target);
    await fs.mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    if (target.kind === "skill") await copyDirectoryChecked(target.absolutePath, destination);
    else {
      await assertRegularFile(target.absolutePath);
      await fs.copyFile(target.absolutePath, destination);
      await fs.chmod(destination, 0o600).catch(() => undefined);
      if (await hashFile(destination) !== target.preImageHash) throw new RemovalError("AH-REMOVE-STALE");
    }
  }
};

const restoreSkill = async (source: OperationTarget, backup: string): Promise<void> => {
  await fs.mkdir(dirname(source.absolutePath), { recursive: true, mode: 0o700 });
  const temporary = `${source.absolutePath}.agent-hygiene-restore-${Date.now()}`;
  await copyDirectoryChecked(backup, temporary);
  await fs.rename(temporary, source.absolutePath);
};

const preflightPreimageRestore = async (targets: readonly OperationTarget[]): Promise<void> => {
  for (const target of sourceTargets(targets)) {
    if (target.kind === "skill") await assertMissing(target);
    else {
      let current: string;
      try { current = await currentHash(target); } catch { throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT"); }
      if (current !== target.plannedPostImageHash) throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
    }
  }
};

const restorePreimages = async (store: OperationStore, operation: RemovalOperation, targets: readonly OperationTarget[], journalStatus: "restoring" | "applying"): Promise<void> => {
  const sources = sourceTargets(targets);
  await preflightPreimageRestore(sources);
  const restored: OperationTarget[] = [];
  try {
    for (const target of sources) {
      const backup = backupPath(store, operation, target);
      if (target.kind === "skill") await restoreSkill(target, backup);
      else await writeAtomic(target.absolutePath, await fs.readFile(backup));
      restored.push(target);
      await store.updateJournal(operation.operationId, journalStatus, [], [], [targetKey(target)]);
    }
    for (const target of targets) {
      let current: string;
      try { current = await currentHash(target); } catch { throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT"); }
      if (current !== target.preImageHash) throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
    }
  } catch (error: unknown) {
    try { await applyPostimages(store, operation, restored); }
    catch { throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT"); }
    throw error instanceof RemovalError ? error : new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
  }
};

const configPostText = async (store: OperationStore, operation: RemovalOperation, targets: readonly OperationTarget[]): Promise<string> => {
  const first = targets[0];
  if (first === undefined) throw new RemovalError("AH-REMOVE-OPERATION");
  let text = await fs.readFile(backupPath(store, operation, first), "utf8");
  for (const target of targets) {
    const locator = target.locator;
    if (locator === undefined) throw new RemovalError("AH-REMOVE-UNSUPPORTED");
    assertMcpPresent(text, locator.format, locator.key, locator.name);
    text = removeMcpFromText(text, locator.format, locator.key, locator.name);
  }
  if (createHash("sha256").update(text).digest("hex") !== first.plannedPostImageHash) throw new RemovalError("AH-REMOVE-STALE");
  return text;
};

const applyPostimages = async (store: OperationStore, operation: RemovalOperation, targets: readonly OperationTarget[]): Promise<void> => {
  for (const target of sourceTargets(targets.filter((item) => item.kind === "skill"))) {
    const stat = await fs.lstat(target.absolutePath).catch(() => undefined);
    if (stat !== undefined) await removeDirectoryChecked(target.absolutePath);
  }
  for (const group of configuredGroups(targets)) {
    const first = group[0];
    if (first !== undefined) await writeAtomic(first.absolutePath, Buffer.from(await configPostText(store, operation, group), "utf8"));
  }
};

const applyMcpGroups = async (store: OperationStore, operation: RemovalOperation): Promise<void> => {
  for (const targets of configuredGroups(operation.targets)) {
    const first = targets[0];
    if (first === undefined) continue;
    const keys = targets.map(targetKey);
    await store.updateJournal(operation.operationId, "applying", keys);
    await writeAtomic(first.absolutePath, Buffer.from(await configPostText(store, operation, targets), "utf8"));
    await store.updateJournal(operation.operationId, "applying", [], keys);
  }
};

/** Immediate in-process rollback may rebuild a partially deleted directory from its verified backup. */
const forceRollbackAttempted = async (store: OperationStore, operation: RemovalOperation): Promise<void> => {
  const journal = await store.loadJournal(operation.operationId);
  const attempted = sourceTargets(selectedTargets(operation, journal.attemptedTargetKeys));
  for (const target of attempted) {
    const backup = backupPath(store, operation, target);
    if (target.kind === "skill") {
      await assertNoLinksAlongPath(target.rootPath, dirname(target.absolutePath));
      if (await fs.lstat(target.absolutePath).catch(() => undefined) !== undefined) await removeDirectoryChecked(target.absolutePath);
      await restoreSkill(target, backup);
    } else await writeAtomic(target.absolutePath, await fs.readFile(backup));
    await store.updateJournal(operation.operationId, "applying", [], [], [targetKey(target)]);
  }
};

const sourceState = async (target: OperationTarget): Promise<"pre" | "post" | "unknown"> => {
  if (target.kind === "skill") {
    const stat = await fs.lstat(target.absolutePath).catch(() => undefined);
    if (stat === undefined) return "post";
  }
  const current = await currentHash(target).catch(() => undefined);
  if (current === target.preImageHash) return "pre";
  if (current === target.plannedPostImageHash) return "post";
  return "unknown";
};

const recoverInterruptedApply = async (store: OperationStore, operation: RemovalOperation): Promise<RemovalOperation> => {
  const journal = await store.loadJournal(operation.operationId);
  const attempted = sourceTargets(selectedTargets(operation, journal.attemptedTargetKeys));
  const post: OperationTarget[] = [];
  for (const target of attempted) {
    const state = await sourceState(target);
    if (state === "unknown") throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
    if (state === "post") post.push(target);
  }
  if (post.length > 0) await restorePreimages(store, operation, post, "applying");
  await verifyPreImages(operation);
  return store.setStatus(operation, "rolled_back");
};

export const applyRemoval = async (store: OperationStore, operationId: string): Promise<RemovalOperation> => {
  const operation = await store.load(operationId);
  const journal = await store.loadJournal(operationId);
  if (operation.status !== "planned" || journal.status !== "planned" || journal.attemptedTargetKeys.length > 0 || journal.appliedTargetKeys.length > 0 || journal.restoredTargetKeys.length > 0) throw new RemovalError("AH-REMOVE-OPERATION");
  await verifyPreImages(operation);
  let applying = await store.setStatus(operation, "applying");
  try {
    await backupAll(store, applying);
    await applyMcpGroups(store, applying);
    for (const target of applying.targets.filter((item) => item.kind === "skill")) {
      await store.updateJournal(applying.operationId, "applying", [targetKey(target)]);
      await removeDirectoryChecked(target.absolutePath);
      await store.updateJournal(applying.operationId, "applying", [], [targetKey(target)]);
    }
    await verifyPostImages(applying);
    applying = await store.setStatus(applying, "applied", { appliedAt: new Date().toISOString() });
    return applying;
  } catch (error: unknown) {
    try {
      await forceRollbackAttempted(store, applying);
      await verifyPreImages(applying);
      await store.setStatus(applying, "rolled_back", { errorCode: error instanceof RemovalError ? error.code : "AH-REMOVE-STALE" });
    } catch {
      await store.setStatus(applying, "failed", { errorCode: "AH-REMOVE-STALE" });
      throw new RemovalError("AH-REMOVE-STALE");
    }
    throw error instanceof RemovalError ? error : new RemovalError("AH-REMOVE-STALE");
  }
};

const continueRestore = async (store: OperationStore, operation: RemovalOperation): Promise<RemovalOperation> => {
  const journal = await store.loadJournal(operation.operationId);
  const restored = new Set(journal.restoredTargetKeys);
  const pending = operation.targets.filter((target) => !restored.has(targetKey(target)));
  for (const target of operation.targets.filter((target) => restored.has(targetKey(target)))) {
    let current: string;
    try { current = await currentHash(target); } catch { throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT"); }
    if (current !== target.preImageHash) throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
  }
  if (pending.length > 0) await restorePreimages(store, operation, pending, "restoring");
  for (const target of operation.targets) {
    let current: string;
    try { current = await currentHash(target); } catch { throw new RemovalError("AH-REMOVE-RESTORE-CONFLICT"); }
    if (current !== target.preImageHash) throw new RemovalError("AH-REMOVE-STALE");
  }
  await verifyInventory(operation, true);
  return store.setStatus(operation, "restored", { restoredAt: new Date().toISOString() });
};

export const restoreRemoval = async (store: OperationStore, operationId: string): Promise<RemovalOperation> => {
  let operation = await store.load(operationId);
  if (operation.status === "applying") return recoverInterruptedApply(store, operation);
  if (operation.status !== "applied" && operation.status !== "restoring") throw new RemovalError("AH-REMOVE-OPERATION");
  if (operation.status === "applied") operation = await store.setStatus(operation, "restoring");
  try { return await continueRestore(store, operation); }
  catch (error: unknown) {
    await store.setStatus(operation, "restoring", { errorCode: error instanceof RemovalError ? error.code : "AH-REMOVE-RESTORE-CONFLICT" });
    throw error instanceof RemovalError ? error : new RemovalError("AH-REMOVE-RESTORE-CONFLICT");
  }
};