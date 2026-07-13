import type { Finding } from "../core/finding.js";
import type { InventoryItem } from "../core/inventory.js";
import { stableId } from "../rules/ids.js";
import { manualStepsFor } from "../rules/manual-steps.js";

const createFinding = (ruleId: string, item: InventoryItem, title: string, impact: string, recommendation: string): Finding => ({
  ruleId,
  instanceId: stableId([ruleId, item.itemId]),
  severity: "warning",
  category: "mcp",
  title,
  impact,
  evidence: [{ kind: "items", itemIds: [item.itemId] }],
  recommendation,
  manualSteps: manualStepsFor(ruleId),
  confidence: "high",
  actionable: true,
});

const createDuplicateFinding = (items: readonly InventoryItem[]): Finding => {
  const itemIds = items.map((item) => item.itemId).sort();
  return {
    ruleId: "mcp-duplicate-endpoint",
    instanceId: stableId(["mcp-duplicate-endpoint", ...itemIds]),
    severity: "warning",
    category: "mcp",
    title: "Active MCP definitions share an endpoint",
    impact: "Multiple active definitions can create duplicate connections or conflicting ownership.",
    evidence: [{ kind: "items", itemIds }],
    recommendation: "Keep one intended active definition or disable the duplicates.",
    manualSteps: manualStepsFor("mcp-duplicate-endpoint"),
    confidence: "high",
    actionable: true,
  };
};
const compareFindings = (left: Finding, right: Finding): number => left.ruleId.localeCompare(right.ruleId, "en") || left.instanceId.localeCompare(right.instanceId, "en");

export const analyzeMcp = (items: readonly InventoryItem[]): readonly Finding[] => {
  const findings: Finding[] = [];
  for (const item of items) {
    if (item.kind !== "mcp" || item.facts.type !== "mcp" || item.status === "disabled") continue;
    if (item.status === "unresolved" || item.facts.transport === "unknown") {
      findings.push(createFinding("mcp-transport-unknown", item, "MCP transport is unresolved", "The MCP cannot be safely evaluated until its transport is known.", "Provide a supported MCP command or URL configuration."));
      continue;
    }
    if (item.facts.packageInvocation === "unpinned") {
      findings.push(createFinding("mcp-package-unpinned", item, "MCP package invocation is not pinned", "An unpinned package may change between runs.", "Pin the MCP package to an exact version or immutable commit."));
    }
    if (item.facts.urlClass === "plaintext-remote") {
      findings.push(createFinding("mcp-plaintext-remote", item, "MCP uses plaintext remote HTTP", "Remote HTTP can expose MCP traffic in transit.", "Use HTTPS for remote MCP endpoints."));
    }
    if (item.facts.credentialLikeFields.length > 0) {
      findings.push(createFinding("mcp-credential-field", item, "MCP configuration names credential fields", "Credential-bearing configuration deserves an explicit security review.", "Store credentials outside the MCP configuration where possible and review field usage."));
    }
  }
  const activeByFingerprint = new Map<string, InventoryItem[]>();
  for (const item of items) {
    if (item.kind !== "mcp" || item.facts.type !== "mcp" || item.status !== "active" || item.facts.endpointFingerprint === undefined) continue;
    const group = activeByFingerprint.get(item.facts.endpointFingerprint) ?? [];
    group.push(item);
    activeByFingerprint.set(item.facts.endpointFingerprint, group);
  }
  for (const group of activeByFingerprint.values()) if (group.length > 1) findings.push(createDuplicateFinding(group));
  return findings.sort(compareFindings);
};