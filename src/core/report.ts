import { createHash } from "node:crypto";

import { compareAgents, type AgentId } from "./agent.js";
import { aggregateCoverage, type Coverage } from "./coverage.js";
import { DIAGNOSTIC_CODES, isDiagnostic, type Diagnostic, type DiagnosticCode, type Severity } from "./diagnostic.js";
import type { Evidence, Finding } from "./finding.js";
import type { InventoryItem } from "./inventory.js";
import { SCAN_LIMITS_V1, type ScanLimitsV1 } from "./limits.js";
import { assertValidSourceRef, compareSourceRefs, type RootDescriptor, type SourceRef } from "./source-ref.js";

export interface AdapterState {
  readonly agent: AgentId;
  readonly status: "not-detected" | "complete" | "partial" | "failed";
  readonly coverage: Coverage;
  readonly inventoryCount: number;
  readonly diagnosticCodes: readonly DiagnosticCode[];
}

export interface SeverityCounts {
  readonly info: number;
  readonly warning: number;
  readonly error: number;
}

export interface ReportSummary {
  readonly inventoryCount: number;
  readonly findings: SeverityCounts;
  readonly diagnostics: SeverityCounts;
}

export interface ReportV1 {
  readonly schemaVersion: 1;
  readonly tool: { readonly name: "agent-hygiene-cli"; readonly version: string };
  readonly scan: {
    readonly startedAt: string;
    readonly durationMs: number;
    readonly platform: string;
    readonly projectRoot: string;
    readonly selectedWorkingDirectory: string;
    readonly selectedAgents: readonly AgentId[];
    readonly limits: ScanLimitsV1;
    readonly coverage: Coverage;
  };
  readonly roots: readonly RootDescriptor[];
  readonly adapters: readonly AdapterState[];
  readonly summary: ReportSummary;
  readonly inventory: readonly InventoryItem[];
  readonly findings: readonly Finding[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface BuildReportInput extends Omit<ReportV1, "schemaVersion" | "scan"> {
  readonly scan: Omit<ReportV1["scan"], "limits"> & { readonly limits?: ScanLimitsV1 | undefined };
}

const KINDS: readonly InventoryItem["kind"][] =
  ["skill", "mcp", "instruction", "configuration", "rule", "plugin", "hook"];
const SEVERITY_ORDER: Readonly<Record<Severity, number>> = { info: 0, warning: 1, error: 2 };

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const asciiFold = (value: string): string =>
  value.replace(/[A-Z]/g, (character) => character.toLowerCase());
const canonicalName = (value: string): string => asciiFold(value.trim().replace(/\s+/g, " "));

const stableHash = (tuple: readonly unknown[]): string =>
  createHash("sha256").update(JSON.stringify(tuple)).digest("hex");

export const createItemId = (
  agent: AgentId,
  kind: InventoryItem["kind"],
  effectiveName: string,
  source: SourceRef,
): string => {
  assertValidSourceRef(source);
  return stableHash([agent, kind, canonicalName(effectiveName), source.rootId, source.relativePath]);
};

const evidenceAnchor = (evidence: Evidence): string => {
  switch (evidence.type) {
    case "source":
      return JSON.stringify(["source", evidence.source.rootId, evidence.source.relativePath]);
    case "field":
      return JSON.stringify(["field", evidence.source.rootId, evidence.source.relativePath, evidence.field]);
    case "metric":
      return JSON.stringify(["metric", evidence.metric, evidence.value, evidence.threshold ?? null]);
    case "items":
      return JSON.stringify(["items", [...evidence.itemIds].sort(compareText)]);
  }
};

export const createFindingInstanceId = (ruleId: string, evidence: readonly Evidence[]): string =>
  stableHash([ruleId, ...evidence.map(evidenceAnchor).sort(compareText)]);

const compareInventory = (left: InventoryItem, right: InventoryItem): number =>
  compareAgents(left.agent, right.agent) ||
  KINDS.indexOf(left.kind) - KINDS.indexOf(right.kind) ||
  compareText(asciiFold(left.name), asciiFold(right.name)) ||
  compareSourceRefs(left.source, right.source) ||
  compareText(left.itemId, right.itemId);

const compareFindings = (left: Finding, right: Finding): number =>
  SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity] ||
  compareText(left.ruleId, right.ruleId) ||
  compareText(left.instanceId, right.instanceId);

const compareDiagnostics = (left: Diagnostic, right: Diagnostic): number => {
  const agent = left.agent === undefined
    ? (right.agent === undefined ? 0 : 1)
    : right.agent === undefined ? -1 : compareAgents(left.agent, right.agent);
  const source = left.source === undefined
    ? (right.source === undefined ? 0 : 1)
    : right.source === undefined ? -1 : compareSourceRefs(left.source, right.source);
  return agent || compareText(left.code, right.code) || source ||
    (left.line ?? 0) - (right.line ?? 0) || (left.column ?? 0) - (right.column ?? 0);
};

const countSeverities = (values: readonly { readonly severity: Severity }[]): SeverityCounts => {
  const counts = { info: 0, warning: 0, error: 0 };
  for (const value of values) counts[value.severity] += 1;
  return counts;
};

const validateSources = (
  inventory: readonly InventoryItem[],
  findings: readonly Finding[],
  diagnostics: readonly Diagnostic[],
): void => {
  for (const item of inventory) assertValidSourceRef(item.source);
  for (const finding of findings) {
    for (const evidence of finding.evidence) {
      if (evidence.type === "source" || evidence.type === "field") assertValidSourceRef(evidence.source);
    }
  }
  for (const diagnostic of diagnostics) {
    if (diagnostic.source !== undefined) assertValidSourceRef(diagnostic.source);
  }
};

const diagnosticCoverage = (diagnostic: Diagnostic): Coverage =>
  diagnostic.coverageImpact === "none" ? "complete" : diagnostic.coverageImpact;

const buildAdapters = (
  adapters: readonly AdapterState[],
  inventory: readonly InventoryItem[],
  diagnostics: readonly Diagnostic[],
): AdapterState[] => adapters.map((adapter) => ({
  ...adapter,
  inventoryCount: inventory.filter((item) => item.agent === adapter.agent).length,
  diagnosticCodes: [...new Set([
    ...adapter.diagnosticCodes,
    ...diagnostics.filter((item) => item.agent === adapter.agent).map((item) => item.code),
  ])].sort((left, right) => DIAGNOSTIC_CODES.indexOf(left) - DIAGNOSTIC_CODES.indexOf(right)),
})).sort((left, right) => compareAgents(left.agent, right.agent));

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export const buildReport = (input: BuildReportInput): ReportV1 => {
  for (const diagnostic of input.diagnostics as readonly unknown[]) {
    if (!isDiagnostic(diagnostic)) {
      throw new Error("AH-REPORT-INVALID-DIAGNOSTIC: diagnostics must use the closed diagnostic catalog");
    }
  }

  const inventory = [...input.inventory].sort(compareInventory);
  const findings = [...input.findings].sort(compareFindings);
  const diagnostics = [...input.diagnostics].sort(compareDiagnostics);
  validateSources(inventory, findings, diagnostics);
  const adapters = buildAdapters(input.adapters, inventory, diagnostics);
  const coverage = aggregateCoverage([
    ...adapters.map((adapter) => adapter.coverage),
    ...diagnostics.map(diagnosticCoverage),
  ]);

  const report: ReportV1 = {
    schemaVersion: 1,
    tool: { ...input.tool },
    scan: {
      startedAt: input.scan.startedAt,
      durationMs: input.scan.durationMs,
      platform: input.scan.platform,
      projectRoot: input.scan.projectRoot,
      selectedWorkingDirectory: input.scan.selectedWorkingDirectory,
      selectedAgents: [...input.scan.selectedAgents].sort(compareAgents),
      limits: { ...(input.scan.limits ?? SCAN_LIMITS_V1) },
      coverage,
    },
    roots: [...input.roots].sort((left, right) => compareText(left.id, right.id)),
    adapters,
    summary: {
      inventoryCount: inventory.length,
      findings: countSeverities(findings),
      diagnostics: countSeverities(diagnostics),
    },
    inventory,
    findings,
    diagnostics,
  };

  return deepFreeze(report) as ReportV1;
};
