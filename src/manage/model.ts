export const OPERATION_SCHEMA_VERSION = 1 as const;

export type ManageKind = "skill" | "mcp";
export type OperationStatus = "planned" | "applying" | "applied" | "restoring" | "restored" | "rolled_back" | "failed";
export type RemovalErrorCode =
  | "AH-REMOVE-INVALID-ITEM"
  | "AH-REMOVE-REFUSED"
  | "AH-REMOVE-STALE"
  | "AH-REMOVE-OPERATION"
  | "AH-REMOVE-CONFIRMATION"
  | "AH-REMOVE-RESTORE-CONFLICT"
  | "AH-REMOVE-UNSUPPORTED";

export interface SafeItemRef {
  readonly itemId: string;
  readonly agent: "codex" | "claude" | "hermes";
  readonly kind: ManageKind;
  readonly name: string;
  readonly scope: "user" | "project";
  readonly source: { readonly rootId: string; readonly relativePath: string };
}

export interface OperationTarget extends SafeItemRef {
  /** Only persisted in a private quarantine manifest; never report this value. */
  readonly absolutePath: string;
  /** Private admitted root used to reject ancestor link escapes during execution. */
  readonly rootPath: string;
  readonly preImageHash: string;
  readonly plannedPostImageHash: string;
  readonly backupPath: string;
  readonly locator?: { readonly key: "mcp_servers" | "mcpServers"; readonly name: string; readonly format: "toml" | "json" | "yaml" };
}

export interface RemovalOperation {
  readonly schemaVersion: typeof OPERATION_SCHEMA_VERSION;
  readonly operationId: string;
  readonly toolVersion: string;
  readonly createdAt: string;
  readonly status: OperationStatus;
  /** Private execution context; never emitted by operations/report output. */
  readonly projectDirectory?: string;
  readonly targets: readonly OperationTarget[];
  readonly errorCode?: RemovalErrorCode;
  readonly appliedAt?: string;
  readonly restoredAt?: string;
}

export interface PublicOperation {
  readonly operationId: string;
  readonly createdAt: string;
  readonly status: OperationStatus;
  readonly itemCount: number;
  readonly items: readonly Pick<SafeItemRef, "agent" | "kind" | "name" | "scope" | "source">[];
}

export class RemovalError extends Error {
  constructor(readonly code: RemovalErrorCode, message = code) {
    super(message);
    this.name = "RemovalError";
  }
}
