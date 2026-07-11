import type { AgentAdapter, AdapterResult } from "./adapter.js";
import type { ScanContext } from "./context.js";
import { DIAGNOSTIC_MESSAGES } from "./diagnostic.js";
export const runAdapters = async (adapters: readonly AgentAdapter[], context: ScanContext): Promise<readonly AdapterResult[]> => Promise.all(adapters.map(async (adapter) => {
  try {
    return await adapter.scan(context);
  } catch {
    return {
      agent: adapter.agent,
      inventory: [],
      diagnostics: [{ code: "adapter_failed", severity: "error", agent: adapter.agent, coverageImpact: "unknown", message: DIAGNOSTIC_MESSAGES.adapter_failed }],
      coverage: "unknown" as const,
    };
  }
}));