import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { OPERATION_SCHEMA_VERSION, type PublicOperation, type RemovalOperation, type OperationStatus, RemovalError } from "./model.js";

const MANIFEST = "manifest.json";
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export const quarantineRoot = (environment: NodeJS.ProcessEnv = process.env): string => {
  if (process.platform === "win32") return join(environment.LOCALAPPDATA ?? environment.USERPROFILE ?? environment.HOME ?? ".", "agent-hygiene", "quarantine");
  return join(environment.HOME ?? environment.USERPROFILE ?? ".", ".agent-hygiene", "quarantine");
};

const safeId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const pathFor = (root: string, id: string): string => {
  if (!safeId(id)) throw new RemovalError("AH-REMOVE-OPERATION");
  return join(root, id);
};

const writeAtomic = async (path: string, text: string): Promise<void> => {
  await fs.mkdir(dirname(path), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, text, { encoding: "utf8", mode: PRIVATE_FILE_MODE, flag: "wx" });
  await fs.rename(temporary, path);
  await fs.chmod(path, PRIVATE_FILE_MODE).catch(() => undefined);
};

const validOperation = (value: unknown): value is RemovalOperation => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === OPERATION_SCHEMA_VERSION && typeof record.operationId === "string" && typeof record.status === "string" && Array.isArray(record.targets);
};

export const createOperationId = (): string => randomUUID();
export const absentHash = (): string => createHash("sha256").update("agent-hygiene:absent:v1").digest("hex");

export class OperationStore {
  constructor(readonly root = quarantineRoot()) {}

  operationDirectory(id: string): string { return pathFor(this.root, id); }
  manifestPath(id: string): string { return join(this.operationDirectory(id), MANIFEST); }

  async create(operation: RemovalOperation): Promise<void> {
    const directory = this.operationDirectory(operation.operationId);
    await fs.mkdir(join(directory, "backups"), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    await fs.chmod(directory, PRIVATE_DIRECTORY_MODE).catch(() => undefined);
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
    await writeAtomic(this.manifestPath(operation.operationId), `${JSON.stringify(operation)}\n`);
  }

  async setStatus(operation: RemovalOperation, status: OperationStatus, extra: Partial<RemovalOperation> = {}): Promise<RemovalOperation> {
    const updated = { ...operation, ...extra, status } as RemovalOperation;
    await this.save(updated);
    return updated;
  }

  async list(): Promise<readonly PublicOperation[]> {
    const names = await fs.readdir(this.root).catch(() => [] as string[]);
    const operations: PublicOperation[] = [];
    for (const name of names.sort()) {
      try {
        const operation = await this.load(name);
        operations.push({ operationId: operation.operationId, createdAt: operation.createdAt, status: operation.status, itemCount: operation.targets.length, items: operation.targets.map(({ agent, kind, name: itemName, scope, source }) => ({ agent, kind, name: itemName, scope, source })) });
      } catch { /* incomplete or untrusted operation directories are deliberately not exposed */ }
    }
    return operations.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
