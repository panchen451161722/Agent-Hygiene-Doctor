import type { AgentId } from "../core/agent.js";
import type { InventoryItem, InventoryFacts } from "../core/inventory.js";
import type { SourceRef } from "../core/source-ref.js";
import { stableId } from "../rules/ids.js";

export interface InspectorContext { readonly agent: AgentId; readonly source: SourceRef; readonly scope: InventoryItem["scope"]; readonly status: InventoryItem["status"]; readonly loading: InventoryItem["loading"]; }
export const item = (context: InspectorContext, kind: InventoryItem["kind"], name: string, facts: InventoryFacts, fingerprint?: string, estimatedTokens?: number): InventoryItem => ({ itemId: stableId([context.agent, kind, name, context.source]), agent: context.agent, kind, name, source: context.source, scope: context.scope, status: context.status, loading: context.loading, ...(fingerprint === undefined ? {} : { fingerprint }), ...(estimatedTokens === undefined ? {} : { estimatedTokens }), facts });