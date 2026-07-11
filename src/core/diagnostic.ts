import { AGENT_IDS, type AgentId } from "./agent.js";
import type { Coverage } from "./coverage.js";
import { assertValidSourceRef, type SourceRef } from "./source-ref.js";

export const DIAGNOSTIC_CODES = [
  "read_failed", "parse_error", "unsafe_reference", "limit_exceeded", "unsupported_value", "adapter_failed",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];
export type Severity = "info" | "warning" | "error";
export const DIAGNOSTIC_MESSAGES: Readonly<Record<DiagnosticCode, string>> = Object.freeze({
  read_failed: "A source could not be read.",
  parse_error: "A source could not be parsed.",
  unsafe_reference: "An unsafe reference was rejected.",
  limit_exceeded: "A scan safety limit was exceeded.",
  unsupported_value: "An unsupported value was encountered.",
  adapter_failed: "An adapter failed during scanning.",
});


export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  readonly agent?: AgentId;
  readonly source?: SourceRef;
  readonly line?: number;
  readonly column?: number;
  readonly coverageImpact: "none" | Exclude<Coverage, "complete">;
  readonly message: string;
}

const hasExactKeys = (value: object, required: readonly string[], optional: readonly string[] = []): boolean => {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key));
};

const isSourceRef = (value: unknown): value is SourceRef => {
  if (typeof value !== "object" || value === null || !hasExactKeys(value, ["rootId", "relativePath"])) return false;
  const source = value as Partial<SourceRef>;
  if (typeof source.rootId !== "string" || typeof source.relativePath !== "string") return false;
  try {
    assertValidSourceRef(source as SourceRef);
    return true;
  } catch {
    return false;
  }
};

export const isDiagnostic = (value: unknown): value is Diagnostic => {
  if (typeof value !== "object" || value === null || value instanceof Error) return false;
  if (!hasExactKeys(value, ["code", "severity", "coverageImpact", "message"], ["agent", "source", "line", "column"])) return false;
  const candidate = value as Partial<Diagnostic>;
  const knownCode = typeof candidate.code === "string" && DIAGNOSTIC_CODES.includes(candidate.code as DiagnosticCode);
  return knownCode &&
    (candidate.severity === "info" || candidate.severity === "warning" || candidate.severity === "error") &&
    (candidate.coverageImpact === "none" || candidate.coverageImpact === "partial" || candidate.coverageImpact === "unknown") &&
    candidate.message === DIAGNOSTIC_MESSAGES[candidate.code as DiagnosticCode] &&
    (candidate.agent === undefined || AGENT_IDS.includes(candidate.agent)) &&
    (candidate.source === undefined || isSourceRef(candidate.source)) &&
    (candidate.line === undefined || (Number.isInteger(candidate.line) && candidate.line > 0)) &&
    (candidate.column === undefined || (Number.isInteger(candidate.column) && candidate.column > 0));
};
