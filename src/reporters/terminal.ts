import type { Evidence } from "../core/finding.js";
import type { ReportV1 } from "../core/report.js";
import type { SourceRef } from "../core/source-ref.js";

const source = (value: SourceRef): string => `${value.rootId}:${value.relativePath}`;

const evidence = (value: Evidence): string => {
  switch (value.kind) {
    case "source": return source(value.source);
    case "field": return `${source(value.source)}#${value.field}`;
    case "metric": return `${value.metric}=${value.value}${value.threshold === undefined ? "" : ` (threshold ${value.threshold})`}`;
    case "items": return `${value.itemIds.length} item(s)`;
  }
};

export const renderTerminal = (report: ReportV1): string => {
  const findingCount = report.summary.findings.info + report.summary.findings.warning + report.summary.findings.error;
  const diagnosticCount = report.summary.diagnostics.info + report.summary.diagnostics.warning + report.summary.diagnostics.error;
  const lines = [
    `Agent Hygiene ${report.tool.version}`,
    `Coverage: ${report.scan.coverage}`,
    `Inventory: ${report.summary.inventoryCount} | Findings: ${findingCount} | Diagnostics: ${diagnosticCount}`,
    "",
    "Adapters:",
    ...report.adapters.map((adapter) => `  ${adapter.agent}: ${adapter.status} (${adapter.coverage}), ${adapter.inventoryCount} item(s)`),
    "",
    "Inventory:",
    ...(report.inventory.length === 0
      ? ["  No artifacts detected."]
      : report.inventory.map((item) => `  [${item.agent}] ${item.kind} ${item.name} — ${item.status}, ${item.scope} — ${source(item.source)}`)),
    "",
    "Findings:",
    ...(report.findings.length === 0
      ? ["  No findings."]
      : report.findings.flatMap((finding) => [
        `  [${finding.severity}] ${finding.title} (${finding.ruleId})`,
        `    Evidence: ${finding.evidence.map(evidence).join(", ")}`,
        `    Recommendation: ${finding.recommendation}`,
      ])),
    "",
    "Diagnostics:",
    ...(report.diagnostics.length === 0
      ? ["  No diagnostics."]
      : report.diagnostics.map((diagnostic) => `  [${diagnostic.severity}] ${diagnostic.code}${diagnostic.agent === undefined ? "" : ` (${diagnostic.agent})`}: ${diagnostic.message}${diagnostic.source === undefined ? "" : ` — ${source(diagnostic.source)}`}`)),
  ];
  return `${lines.join("\n")}\n`;
};