import { terminalText } from "../core/terminal.js";
import type { Evidence } from "../core/finding.js";
import type { ReportV1 } from "../core/report.js";
import type { SourceRef } from "../core/source-ref.js";

const source = (value: SourceRef): string => terminalText(`${value.rootId}:${value.relativePath}`);

const evidence = (value: Evidence): string => {
  switch (value.kind) {
    case "source": return source(value.source);
    case "field": return `${source(value.source)}#${terminalText(value.field)}`;
    case "metric": return `${terminalText(value.metric)}=${terminalText(String(value.value))}${value.threshold === undefined ? "" : ` (threshold ${terminalText(String(value.threshold))})`}`;
    case "items": return `${value.itemIds.length} item(s)`;
  }
};

export const renderTerminal = (report: ReportV1): string => {
  const findingCount = report.summary.findings.info + report.summary.findings.warning + report.summary.findings.error;
  const diagnosticCount = report.summary.diagnostics.info + report.summary.diagnostics.warning + report.summary.diagnostics.error;
  const lines = [
    `Agent Hygiene ${terminalText(report.tool.version)}`,
    `Coverage: ${terminalText(report.scan.coverage)}`,
    `Inventory: ${report.summary.inventoryCount} | Findings: ${findingCount} | Diagnostics: ${diagnosticCount}`,
    "",
    "Adapters:",
    ...report.adapters.map((adapter) => `  ${terminalText(adapter.agent)}: ${terminalText(adapter.status)} (${terminalText(adapter.coverage)}), ${adapter.inventoryCount} item(s)`),
    "",
    "Inventory:",
    ...(report.inventory.length === 0
      ? ["  No artifacts detected."]
      : report.inventory.map((item) => `  [${terminalText(item.agent)}] ${terminalText(item.kind)} ${terminalText(item.name)} — ${terminalText(item.status)}, ${terminalText(item.scope)} — ${source(item.source)}`)),
    "",
    "Findings:",
    ...(report.findings.length === 0
      ? ["  No findings."]
      : report.findings.flatMap((finding) => [
        `  [${terminalText(finding.severity)}] ${terminalText(finding.title)} (${terminalText(finding.ruleId)})`,
        `    Evidence: ${finding.evidence.map(evidence).join(", ")}`,
        `    Recommendation: ${terminalText(finding.recommendation)}`,
      ])),
    "",
    "Diagnostics:",
    ...(report.diagnostics.length === 0
      ? ["  No diagnostics."]
      : report.diagnostics.map((diagnostic) => `  [${terminalText(diagnostic.severity)}] ${terminalText(diagnostic.code)}${diagnostic.agent === undefined ? "" : ` (${terminalText(diagnostic.agent)})`}: ${terminalText(diagnostic.message)}${diagnostic.source === undefined ? "" : ` — ${source(diagnostic.source)}`}`)),
  ];
  return `${lines.join("\n")}\n`;
};