import type { AgentId } from "./agent.js";
import type { Diagnostic } from "./diagnostic.js";
import type { InventoryItem } from "./inventory.js";
import type { ScanContext } from "./context.js";
export interface AdapterResult { readonly agent: AgentId; readonly inventory: readonly InventoryItem[]; readonly diagnostics: readonly Diagnostic[]; readonly coverage: "complete" | "partial" | "unknown"; }
export interface AgentAdapter { readonly agent: AgentId; scan(context: ScanContext): Promise<AdapterResult>; }