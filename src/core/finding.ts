import type { Severity } from "./diagnostic.js";
import type { SourceRef } from "./source-ref.js";

export type Evidence =
  | { readonly kind: "source"; readonly source: SourceRef }
  | { readonly kind: "field"; readonly source: SourceRef; readonly field: string }
  | { readonly kind: "metric"; readonly metric: "bytes" | "estimatedTokens" | "count"; readonly value: number; readonly threshold?: number }
  | { readonly kind: "items"; readonly itemIds: readonly string[] };

export interface Finding {
  readonly ruleId: string;
  readonly instanceId: string;
  readonly severity: Severity;
  readonly category: string;
  readonly title: string;
  readonly impact: string;
  readonly evidence: readonly Evidence[];
  readonly recommendation: string;
  readonly manualSteps: readonly string[];
  readonly confidence: "low" | "medium" | "high";
  readonly actionable: boolean;
}
