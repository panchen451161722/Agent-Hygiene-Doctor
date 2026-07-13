import type { AgentId } from "../agent.js";
import { DIAGNOSTIC_MESSAGES, type Diagnostic } from "../diagnostic.js";
import type { SourceRef } from "../source-ref.js";
import type { SafeReadResult } from "./safe-fs.js";

/** Converts a bounded filesystem failure into a stable, redacted report diagnostic. */
export const safeFsDiagnostic = (agent: AgentId, source: SourceRef, result: SafeReadResult): Diagnostic | undefined => {
  if (result.diagnostic.code === "not_found") return undefined;
  const code = result.diagnostic.code === "limit_exceeded" ? "limit_exceeded" : "unsafe_reference";
  return { code, severity: "warning", agent, source, coverageImpact: "partial", message: DIAGNOSTIC_MESSAGES[code] };
};