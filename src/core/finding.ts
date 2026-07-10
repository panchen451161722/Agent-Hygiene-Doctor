import type { Severity } from "./diagnostic.js";
import type { SourceRef } from "./source-ref.js";

export type Evidence =
  | { readonly type: "source"; readonly source: SourceRef }
  | { readonly type: "field"; readonly source: SourceRef; readonly field: string }
  | { readonly type: "metric"; readonly metric: "bytes" | "estimatedTokens" | "count"; readonly value: number; readonly threshold?: number }
  | { readonly type: "items"; readonly itemIds: readonly string[] };

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
