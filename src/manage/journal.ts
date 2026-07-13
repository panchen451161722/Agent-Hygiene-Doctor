import type { OperationStatus } from "./model.js";

export const JOURNAL_SCHEMA_VERSION = 1 as const;
const JOURNAL_KEYS = ["schemaVersion", "operationId", "status", "attemptedTargetKeys", "appliedTargetKeys", "restoredTargetKeys", "updatedAt"] as const;

export interface OperationJournal {
  readonly schemaVersion: typeof JOURNAL_SCHEMA_VERSION;
  readonly operationId: string;
  readonly status: OperationStatus;
  /** Sources whose mutation started; may be in a partial state after a crash. */
  readonly attemptedTargetKeys: readonly string[];
  /** Sources whose post-image is known to have been applied. */
  readonly appliedTargetKeys: readonly string[];
  /** Sources whose pre-image is known to have been restored. */
  readonly restoredTargetKeys: readonly string[];
  readonly updatedAt: string;
}

export const createJournal = (operationId: string): OperationJournal => ({
  schemaVersion: JOURNAL_SCHEMA_VERSION,
  operationId,
  status: "planned",
  attemptedTargetKeys: [],
  appliedTargetKeys: [],
  restoredTargetKeys: [],
  updatedAt: new Date().toISOString(),
});

export const isJournal = (value: unknown): value is OperationJournal => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const stringArray = (entry: unknown): entry is readonly string[] => Array.isArray(entry) && entry.every((item) => typeof item === "string");
  return keys.length === JOURNAL_KEYS.length && JOURNAL_KEYS.every((key) => Object.hasOwn(record, key)) && keys.every((key) => JOURNAL_KEYS.includes(key as typeof JOURNAL_KEYS[number])) &&
    record.schemaVersion === JOURNAL_SCHEMA_VERSION && typeof record.operationId === "string" && typeof record.status === "string" &&
    stringArray(record.attemptedTargetKeys) && stringArray(record.appliedTargetKeys) && stringArray(record.restoredTargetKeys) && typeof record.updatedAt === "string";
};