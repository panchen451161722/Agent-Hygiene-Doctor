import type { Finding } from "../core/finding.js";
import type { InventoryItem } from "../core/inventory.js";
import { stableId } from "../rules/ids.js";
const finding = (ruleId: string, item: InventoryItem, title: string, severity: Finding["severity"]): Finding => ({ ruleId, instanceId: stableId([ruleId, item.itemId]), severity, category: "inventory", title, impact: title, evidence: [{ kind: "source", source: item.source }], recommendation: "Review the referenced artifact.", manualSteps: [], confidence: "medium", actionable: true });
export const analyzeInventory = (items: readonly InventoryItem[]): readonly Finding[] => items.filter((item) => item.status === "unresolved").map((item) => finding("unresolved-artifact", item, "Artifact activation is unresolved", "warning"));
export const analyzeExtensions = analyzeInventory;

