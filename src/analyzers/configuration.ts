import type { Finding } from "../core/finding.js";
import type { InventoryItem } from "../core/inventory.js";
import { stableId } from "../rules/ids.js";

const finding = (item: InventoryItem): Finding => ({
  ruleId: "unresolved-artifact",
  instanceId: stableId(["unresolved-artifact", item.itemId]),
  severity: "warning",
  category: "configuration",
  title: "Configuration activation is unresolved",
  impact: "The configuration cannot be safely evaluated.",
  evidence: [{ kind: "items", itemIds: [item.itemId] }],
  recommendation: "Review the referenced configuration artifact.",
  manualSteps: [],
  confidence: "medium",
  actionable: true,
});

export const analyzeConfiguration = (items: readonly InventoryItem[]): readonly Finding[] => items
  .filter((item) => item.kind === "configuration" && item.facts.type === "configuration" && item.status === "unresolved")
  .map(finding)
  .sort((left, right) => left.instanceId.localeCompare(right.instanceId, "en"));