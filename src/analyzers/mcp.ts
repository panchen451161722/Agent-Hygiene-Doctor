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
  evidence: [{ kind: "source", source: item.source }],
  recommendation,
  manualSteps: manualStepsFor(ruleId),
  confidence: "high",
  actionable: true,
});

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
  return findings.sort(compareFindings);
};