import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { assertValidSourceRef } from "../core/source-ref.js";
import { createJournal, isJournal, type OperationJournal } from "./journal.js";
import { OPERATION_SCHEMA_VERSION, type PublicOperation, type RemovalOperation, type OperationStatus, RemovalError } from "./model.js";

const MANIFEST = "manifest.json";
const JOURNAL = "journal.json";
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const STATUSES: readonly OperationStatus[] = ["planned", "applying", "applied", "restoring", "restored", "rolled_back", "failed"];
const OPERATION_KEYS = new Set(["schemaVersion", "operationId", "toolVersion", "createdAt", "status", "projectDirectory", "targets", "errorCode", "appliedAt", "restoredAt"]);
const TARGET_KEYS = new Set(["itemId", "agent", "kind", "name", "scope", "source", "absolutePath", "rootPath", "preImageHash", "plannedPostImageHash", "backupPath", "locator"]);
const SOURCE_KEYS = new Set(["rootId", "relativePath"]);
const LOCATOR_KEYS = new Set(["key", "name", "format"]);

export const quarantineRoot = (environment: NodeJS.ProcessEnv = process.env): string => {
  if (process.platform === "win32") return join(environment.LOCALAPPDATA ?? environment.USERPROFILE ?? environment.HOME ?? ".", "agent-hygiene", "quarantine");
  return join(environment.HOME ?? environment.USERPROFILE ?? ".", ".agent-hygiene", "quarantine");
};

const safeId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const pathFor = (root: string, id: string): string => {
  if (!safeId(id)) throw new RemovalError("AH-REMOVE-OPERATION");
  return join(root, id);
};
const onlyKeys = (record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean => Object.keys(record).every((key) => allowed.has(key));
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
const asRecord = (value: unknown): Record<string, unknown> | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;const safeBackupPath = (value: string): boolean => value.startsWith("backups/") && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..") && !value.includes("\\");
const safeTargetPath = (rootPath: string, absolutePath: string): boolean => {
  const windowsAbsolute = (value: string): boolean => /^[A-Za-z]:[\\/]/u.test(value);
  if (windowsAbsolute(rootPath) || windowsAbsolute(absolutePath)) {
    if (!windowsAbsolute(rootPath) || !windowsAbsolute(absolutePath)) return false;
    const root = rootPath.replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
    const target = absolutePath.replaceAll("\\", "/").toLowerCase();
    return target.startsWith(`${root}/`) && target !== root;
  }
  if (!isAbsolute(rootPath) || !isAbsolute(absolutePath)) return false;
  const path = relative(resolve(rootPath), resolve(absolutePath));
  return path.length > 0 && !path.startsWith("..") && !path.includes("..\\") && !path.includes("../");
};

const writeAtomic = async (path: string, text: string): Promise<void> => {
  await fs.mkdir(dirname(path), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, text, { encoding: "utf8", mode: PRIVATE_FILE_MODE, flag: "wx" });
  await fs.rename(temporary, path);
  await fs.chmod(path, PRIVATE_FILE_MODE).catch(() => undefined);
};

const validTarget = (value: unknown): boolean => {
  const target = asRecord(value);
  if (target === undefined || !onlyKeys(target, TARGET_KEYS) || typeof target.itemId !== "string" || !["codex", "claude", "hermes"].includes(String(target.agent)) || !["skill", "mcp"].includes(String(target.kind)) || typeof target.name !== "string" || !["user", "project"].includes(String(target.scope)) || typeof target.absolutePath !== "string" || typeof target.rootPath !== "string" || !safeTargetPath(target.rootPath, target.absolutePath) || !isHash(target.preImageHash) || !isHash(target.plannedPostImageHash) || typeof target.backupPath !== "string" || !safeBackupPath(target.backupPath)) return false;
  const source = asRecord(target.source);
  if (source === undefined || !onlyKeys(source, SOURCE_KEYS) || typeof source.rootId !== "string" || typeof source.relativePath !== "string") return false;
  try { assertValidSourceRef({ rootId: source.rootId, relativePath: source.relativePath }); } catch { return false; }
  if (target.locator === undefined) return target.kind === "skill";
  const locator = asRecord(target.locator);
  return target.kind === "mcp" && locator !== undefined && onlyKeys(locator, LOCATOR_KEYS) && ["mcp_servers", "mcpServers"].includes(String(locator.key)) && typeof locator.name === "string" && ["toml", "json", "yaml"].includes(String(locator.format));
};

const validOperation = (value: unknown): value is RemovalOperation => {
  const record = asRecord(value);
  if (record === undefined || !onlyKeys(record, OPERATION_KEYS) || record.schemaVersion !== OPERATION_SCHEMA_VERSION || typeof record.operationId !== "string" || !safeId(record.operationId) || typeof record.toolVersion !== "string" || typeof record.createdAt !== "string" || !STATUSES.includes(record.status as OperationStatus) || !Array.isArray(record.targets) || record.targets.length === 0 || (record.projectDirectory !== undefined && typeof record.projectDirectory !== "string") || (record.errorCode !== undefined && (typeof record.errorCode !== "string" || !record.errorCode.startsWith("AH-REMOVE-"))) || (record.appliedAt !== undefined && typeof record.appliedAt !== "string") || (record.restoredAt !== undefined && typeof record.restoredAt !== "string")) return false;
  return record.targets.every(validTarget);
};

export const createOperationId = (): string => randomUUID();
export const absentHash = (): string => createHash("sha256").update("agent-hygiene:absent:v1").digest("hex");

export class OperationStore {
  constructor(readonly root = quarantineRoot()) {}

  operationDirectory(id: string): string { return pathFor(this.root, id); }
  manifestPath(id: string): string { return join(this.operationDirectory(id), MANIFEST); }
  journalPath(id: string): string { return join(this.operationDirectory(id), JOURNAL); }

  async create(operation: RemovalOperation): Promise<void> {
    if (!validOperation(operation)) throw new RemovalError("AH-REMOVE-OPERATION");
    const directory = this.operationDirectory(operation.operationId);
    await fs.mkdir(this.root, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    await fs.chmod(this.root, PRIVATE_DIRECTORY_MODE).catch(() => undefined);
    await fs.mkdir(join(directory, "backups"), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    await fs.chmod(directory, PRIVATE_DIRECTORY_MODE).catch(() => undefined);
    await this.saveJournal(createJournal(operation.operationId));
    await this.save(operation);
  }

  async load(id: string): Promise<RemovalOperation> {
    let parsed: unknown;
    try { parsed = JSON.parse(await fs.readFile(this.manifestPath(id), "utf8")) as unknown; }
    catch { throw new RemovalError("AH-REMOVE-OPERATION"); }
    if (!validOperation(parsed) || parsed.operationId !== id) throw new RemovalError("AH-REMOVE-OPERATION");
    return parsed;
  }

  async save(operation: RemovalOperation): Promise<void> {
    if (!validOperation(operation)) throw new RemovalError("AH-REMOVE-OPERATION");
    await writeAtomic(this.manifestPath(operation.operationId), `${JSON.stringify(operation)}\n`);
  }

  async loadJournal(id: string): Promise<OperationJournal> {
    let parsed: unknown;
    try { parsed = JSON.parse(await fs.readFile(this.journalPath(id), "utf8")) as unknown; }
    catch { throw new RemovalError("AH-REMOVE-OPERATION"); }
    if (!isJournal(parsed) || parsed.operationId !== id || !STATUSES.includes(parsed.status)) throw new RemovalError("AH-REMOVE-OPERATION");
    return parsed;
  }

  async saveJournal(journal: OperationJournal): Promise<void> {
    if (!isJournal(journal) || !STATUSES.includes(journal.status)) throw new RemovalError("AH-REMOVE-OPERATION");
    await writeAtomic(this.journalPath(journal.operationId), `${JSON.stringify(journal)}\n`);
  }

  async updateJournal(operationId: string, status: OperationStatus, attemptedTargetKeys: readonly string[] = [], appliedTargetKeys: readonly string[] = [], restoredTargetKeys: readonly string[] = []): Promise<OperationJournal> {
    const current = await this.loadJournal(operationId);
    const journal: OperationJournal = {
      ...current,
      status,
      attemptedTargetKeys: [...new Set([...current.attemptedTargetKeys, ...attemptedTargetKeys])].sort(),
      appliedTargetKeys: [...new Set([...current.appliedTargetKeys, ...appliedTargetKeys])].sort(),
      restoredTargetKeys: [...new Set([...current.restoredTargetKeys, ...restoredTargetKeys])].sort(),
      updatedAt: new Date().toISOString(),
    };
    await this.saveJournal(journal);
    return journal;
  }

  async setStatus(operation: RemovalOperation, status: OperationStatus, extra: Partial<RemovalOperation> = {}): Promise<RemovalOperation> {
    const updated = { ...operation, ...extra, status } as RemovalOperation;
    await this.save(updated);
    await this.updateJournal(updated.operationId, status);
    return updated;
  }

  async list(): Promise<readonly PublicOperation[]> {
    const names = await fs.readdir(this.root).catch(() => [] as string[]);
    const operations: PublicOperation[] = [];
    for (const name of names.sort()) {
      try {
        const operation = await this.load(name);
        operations.push({ operationId: operation.operationId, createdAt: operation.createdAt, status: operation.status, itemCount: operation.targets.length, items: operation.targets.map(({ agent, kind, name: itemName, scope, source }) => ({ agent, kind, name: itemName, scope, source })) });
      } catch { /* Corrupt or incomplete private operation directories are never surfaced as executable records. */ }
    }
    return operations.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}