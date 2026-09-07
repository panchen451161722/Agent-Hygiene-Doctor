import { terminalText } from "../core/terminal.js";
import type { Evidence } from "../core/finding.js";
import type { ReportV1 } from "../core/report.js";
import type { SourceRef } from "../core/source-ref.js";

const source = (value: SourceRef): string => terminalText(`${value.rootId}:${value.relativePath}`);
const width = (values: readonly string[]): number => Math.max(0, ...values.map((value) => value.length));

const adapterLines = (report: ReportV1): readonly string[] => {
  const rows = report.adapters.map((adapter) => ({
    agent: terminalText(adapter.agent),
    status: terminalText(adapter.status),
    coverage: terminalText(adapter.coverage),
    count: String(adapter.inventoryCount),
  }));
  const widths = { agent: width(rows.map((row) => row.agent)), status: width(rows.map((row) => row.status)), coverage: width(rows.map((row) => row.coverage)), count: width(rows.map((row) => row.count)) };
  return rows.map((row) => `  ${row.agent.padEnd(widths.agent)}: ${row.status.padEnd(widths.status)} (${row.coverage.padEnd(widths.coverage)}), ${row.count.padStart(widths.count)} item(s)`);
};

const inventoryLines = (report: ReportV1): readonly string[] => {
  const rows = report.inventory.map((item) => ({
    agent: terminalText(item.agent),
    kind: terminalText(item.kind),
    name: terminalText(item.name),
    status: terminalText(item.status),
    scope: terminalText(item.scope),
    source: source(item.source),
  }));
  const widths = { agent: width(rows.map((row) => row.agent)), kind: width(rows.map((row) => row.kind)), name: width(rows.map((row) => row.name)), status: width(rows.map((row) => row.status)), scope: width(rows.map((row) => row.scope)) };
  return rows.map((row) => `  [${row.agent.padEnd(widths.agent)}] ${row.kind.padEnd(widths.kind)} ${row.name.padEnd(widths.name)} — ${row.status},${" ".repeat(widths.status - row.status.length + 1)}${row.scope.padEnd(widths.scope)} — ${row.source}`);
};

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
    ...adapterLines(report),
    "",
    "Inventory:",
    ...(report.inventory.length === 0
      ? ["  No artifacts detected."]
      : inventoryLines(report)),
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
