import type { AgentId } from "./agent.js";
import type { Coverage } from "./coverage.js";
import type { SourceRef } from "./source-ref.js";

export const DIAGNOSTIC_CODES = [
  "read_failed", "parse_error", "unsafe_reference", "limit_exceeded", "unsupported_value", "adapter_failed",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];
export type Severity = "info" | "warning" | "error";

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

export const isDiagnostic = (value: unknown): value is Diagnostic => {
  if (typeof value !== "object" || value === null || value instanceof Error) return false;
  const candidate = value as Partial<Diagnostic>;
  return typeof candidate.code === "string" && DIAGNOSTIC_CODES.includes(candidate.code as DiagnosticCode) &&
    (candidate.severity === "info" || candidate.severity === "warning" || candidate.severity === "error") &&
    (candidate.coverageImpact === "none" || candidate.coverageImpact === "partial" || candidate.coverageImpact === "unknown") &&
    typeof candidate.message === "string";
};
