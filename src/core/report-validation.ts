import { AGENT_IDS } from "./agent.js";
import { DIAGNOSTIC_CODES, isDiagnostic } from "./diagnostic.js";
import type { Evidence } from "./finding.js";
import type { InventoryFacts, InventoryItem } from "./inventory.js";
import type { ScanLimitsV1 } from "./limits.js";
import type { BuildReportInput } from "./report.js";
import { assertValidSourceRef, type SourceRef } from "./source-ref.js";

type RecordValue = Record<string, unknown>;

const fail = (code: string, detail: string): never => {
  throw new Error(`${code}: ${detail}`);
};

const record = (value: unknown, required: readonly string[], optional: readonly string[] = []): RecordValue => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("AH-REPORT-INVALID-SHAPE", "expected object");
  }
  const keys = Object.keys(value);
  if (!required.every((key) => keys.includes(key)) ||
      !keys.every((key) => required.includes(key) || optional.includes(key))) {
    return fail("AH-REPORT-INVALID-SHAPE", "object keys do not match the report contract");
  }
  return value as RecordValue;
};

const string = (value: unknown): string =>
  typeof value === "string" ? value : fail("AH-REPORT-INVALID-SHAPE", "expected string");
const nonEmpty = (value: unknown): string => {
  const result = string(value);
  return result.length > 0 ? result : fail("AH-REPORT-INVALID-SHAPE", "expected non-empty string");
};
const boolean = (value: unknown): boolean =>
  typeof value === "boolean" ? value : fail("AH-REPORT-INVALID-SHAPE", "expected boolean");
const number = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fail("AH-REPORT-INVALID-SHAPE", "expected finite number");
const nonNegative = (value: unknown): number => {
  const result = number(value);
  return result >= 0 ? result : fail("AH-REPORT-INVALID-SHAPE", "expected non-negative number");
};
const integer = (value: unknown, minimum = 0): number => {
  const result = number(value);
  return Number.isInteger(result) && result >= minimum
    ? result
    : fail("AH-REPORT-INVALID-SHAPE", "expected bounded integer");
};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : fail("AH-REPORT-INVALID-SHAPE", "expected array");
const enumeration = <T extends string>(value: unknown, values: readonly T[]): T =>
  typeof value === "string" && values.includes(value as T)
    ? value as T
    : fail("AH-REPORT-INVALID-SHAPE", "unsupported enum value");

const sourceRef = (value: unknown): SourceRef => {
  const source = record(value, ["rootId", "relativePath"]);
  const result = { rootId: string(source.rootId), relativePath: string(source.relativePath) };
  assertValidSourceRef(result);
  return result;
};

const unique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) fail("AH-REPORT-DUPLICATE-ID", `duplicate ${label}`);
};

const optionalString = (value: unknown): void => {
  if (value !== undefined) string(value);
};

const validateFacts = (kind: InventoryItem["kind"], value: unknown): InventoryFacts => {
  if (kind === "skill") {
    const facts = record(value, ["type", "frontmatter", "nameUsable", "descriptionUsable"], ["effectiveName"]);
    if (facts.type !== "skill") fail("AH-REPORT-INVALID-SHAPE", "skill requires skill facts");
    enumeration(facts.frontmatter, ["valid", "malformed", "missing"]);
    boolean(facts.nameUsable);
    boolean(facts.descriptionUsable);
    optionalString(facts.effectiveName);
  } else if (kind === "mcp") {
    const facts = record(value, ["type", "transport", "credentialLikeFields"],
      ["endpointFingerprint", "commandResolution", "packageInvocation", "urlClass"]);
    if (facts.type !== "mcp") fail("AH-REPORT-INVALID-SHAPE", "mcp requires mcp facts");
    enumeration(facts.transport, ["stdio", "http", "sse", "unknown"]);
    array(facts.credentialLikeFields).forEach(string);
    optionalString(facts.endpointFingerprint);
    if (facts.commandResolution !== undefined) enumeration(facts.commandResolution, ["resolved", "not-found", "unknown"]);
    if (facts.packageInvocation !== undefined) enumeration(facts.packageInvocation, ["exact", "unpinned", "not-applicable", "unknown"]);
    if (facts.urlClass !== undefined) enumeration(facts.urlClass, ["loopback", "tls", "plaintext-remote", "unknown"]);
  } else if (kind === "instruction") {
    const facts = record(value, ["type", "byteLength", "normalizedContentFingerprint", "condition"]);
    if (facts.type !== "instruction") fail("AH-REPORT-INVALID-SHAPE", "instruction requires instruction facts");
    integer(facts.byteLength);
    nonEmpty(facts.normalizedContentFingerprint);
    enumeration(facts.condition, ["global", "path-scoped", "on-demand", "unknown"]);
  } else if (kind === "configuration") {
    const facts = record(value, ["type", "format", "parseStatus", "precedence"]);
    if (facts.type !== "configuration") fail("AH-REPORT-INVALID-SHAPE", "configuration requires configuration facts");
    enumeration(facts.format, ["json", "yaml", "toml"]);
    enumeration(facts.parseStatus, ["valid", "invalid"]);
    number(facts.precedence);
  } else {
    const facts = record(value, ["type", "extensionKind", "activation"]);
    if (facts.type !== "extension" || facts.extensionKind !== kind) {
      fail("AH-REPORT-INVALID-SHAPE", "extension facts must match inventory kind");
    }
    enumeration(facts.activation, ["active", "disabled", "candidate", "unknown"]);
  }
  return value as InventoryFacts;
};

const validateEvidence = (value: unknown): Evidence => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("AH-REPORT-INVALID-SHAPE", "expected evidence object");
  }
  const kind = enumeration((value as RecordValue).kind, ["source", "field", "metric", "items"]);
  if (kind === "source") {
    const evidence = record(value, ["kind", "source"]);
    sourceRef(evidence.source);
  } else if (kind === "field") {
    const evidence = record(value, ["kind", "source", "field"]);
    sourceRef(evidence.source);
    string(evidence.field);
  } else if (kind === "metric") {
    const evidence = record(value, ["kind", "metric", "value"], ["threshold"]);
    enumeration(evidence.metric, ["bytes", "estimatedTokens", "count"]);
    number(evidence.value);
    if (evidence.threshold !== undefined) number(evidence.threshold);
  } else {
    const evidence = record(value, ["kind", "itemIds"]);
    array(evidence.itemIds).forEach(string);
  }
  return value as Evidence;
};

const validateLimits = (value: unknown): void => {
  if (value === undefined) return;
  const keys: readonly (keyof ScanLimitsV1)[] = [
    "maxConcurrentFsOps", "maxRootsPerAdapter", "maxFilesPerRoot", "maxBytesPerRoot",
    "maxDirectoryDepth", "maxEntriesPerDirectory", "maxArtifactsPerAdapter", "maxFileBytes",
    "maxLinkHops", "maxParserDepth", "maxParserNodes", "maxYamlAliases",
  ];
  const limits = record(value, keys);
  for (const key of keys) integer(limits[key], key === "maxYamlAliases" ? 0 : 1);
};

const validateCounts = (value: unknown): void => {
  const counts = record(value, ["info", "warning", "error"]);
  integer(counts.info);
  integer(counts.warning);
  integer(counts.error);
};

const evidenceSources = (evidence: Evidence): readonly SourceRef[] =>
  evidence.kind === "source" || evidence.kind === "field" ? [evidence.source] : [];

export const validateReportInput = (input: BuildReportInput): void => {
  const top = record(input, ["tool", "scan", "roots", "adapters", "summary", "inventory", "findings", "diagnostics"]);
  const tool = record(top.tool, ["name", "version"]);
  if (tool.name !== "agent-hygiene-cli") fail("AH-REPORT-INVALID-SHAPE", "invalid tool name");
  nonEmpty(tool.version);

  const scan = record(top.scan, [
    "startedAt", "durationMs", "platform", "projectRoot", "selectedWorkingDirectory",
    "selectedAgents", "coverage",
  ], ["limits"]);
  nonEmpty(scan.startedAt);
  nonNegative(scan.durationMs);
  enumeration(scan.platform, ["win32", "darwin", "linux"]);
  const projectRoot = sourceRef(scan.projectRoot);
  const workingDirectory = sourceRef(scan.selectedWorkingDirectory);
  const selectedAgents = array(scan.selectedAgents).map((agent) => enumeration(agent, AGENT_IDS));
  unique(selectedAgents, "selected agent");
  validateLimits(scan.limits);
  enumeration(scan.coverage, ["complete", "partial", "unknown"]);

  const roots = array(top.roots).map((value) => {
    const root = record(value, ["id", "kind", "alias"]);
    nonEmpty(root.id);
    enumeration(root.kind, ["project", "home", "agent-home", "managed", "external"]);
    nonEmpty(root.alias);
    return value as BuildReportInput["roots"][number];
  });
  unique(roots.map((root) => root.id), "root id");
  const rootIds = new Set(roots.map((root) => root.id));

  const adapters = array(top.adapters).map((value) => {
    const adapter = record(value, ["agent", "status", "coverage", "inventoryCount", "diagnosticCodes"]);
    enumeration(adapter.agent, AGENT_IDS);
    enumeration(adapter.status, ["not-detected", "complete", "partial", "failed"]);
    enumeration(adapter.coverage, ["complete", "partial", "unknown"]);
    integer(adapter.inventoryCount);
    array(adapter.diagnosticCodes).forEach((code) => enumeration(code, DIAGNOSTIC_CODES));
    return value as BuildReportInput["adapters"][number];
  });
  unique(adapters.map((adapter) => adapter.agent), "adapter agent");

  const summary = record(top.summary, ["inventoryCount", "findings", "diagnostics"]);
  integer(summary.inventoryCount);
  validateCounts(summary.findings);
  validateCounts(summary.diagnostics);

  const inventory = array(top.inventory).map((value) => {
    const item = record(value, ["itemId", "agent", "kind", "name", "source", "scope", "status", "loading", "facts"],
      ["fingerprint", "estimatedTokens"]);
    string(item.itemId);
    enumeration(item.agent, AGENT_IDS);
    const kind = enumeration(item.kind, ["skill", "mcp", "instruction", "configuration", "rule", "plugin", "hook"]);
    string(item.name);
    sourceRef(item.source);
    enumeration(item.scope, ["user", "project", "managed", "plugin", "external"]);
    enumeration(item.status, ["active", "disabled", "shadowed", "candidate", "unresolved"]);
    enumeration(item.loading, ["always", "conditional", "lazy", "deferred", "unknown"]);
    optionalString(item.fingerprint);
    if (item.estimatedTokens !== undefined) nonNegative(item.estimatedTokens);
    validateFacts(kind, item.facts);
    return value as InventoryItem;
  });
  unique(inventory.map((item) => item.itemId), "item id");
  const itemIds = new Set(inventory.map((item) => item.itemId));

  const findings = array(top.findings).map((value) => {
    const finding = record(value, [
      "ruleId", "instanceId", "severity", "category", "title", "impact", "evidence",
      "recommendation", "manualSteps", "confidence", "actionable",
    ]);
    nonEmpty(finding.ruleId);
    nonEmpty(finding.instanceId);
    enumeration(finding.severity, ["info", "warning", "error"]);
    nonEmpty(finding.category);
    nonEmpty(finding.title);
    nonEmpty(finding.impact);
    array(finding.evidence).forEach(validateEvidence);
    nonEmpty(finding.recommendation);
    array(finding.manualSteps).forEach(string);
    enumeration(finding.confidence, ["low", "medium", "high"]);
    boolean(finding.actionable);
    return value as BuildReportInput["findings"][number];
  });
  unique(findings.map((finding) => finding.instanceId), "finding id");

  const diagnostics = array(top.diagnostics);
  if (!diagnostics.every(isDiagnostic)) fail("AH-REPORT-INVALID-DIAGNOSTIC", "diagnostics must use the closed catalog");

  const sources: SourceRef[] = [projectRoot, workingDirectory];
  inventory.forEach((item) => sources.push(item.source));
  findings.forEach((finding) => finding.evidence.forEach((evidence) => sources.push(...evidenceSources(evidence))));
  diagnostics.forEach((diagnostic) => {
    if (isDiagnostic(diagnostic) && diagnostic.source !== undefined) sources.push(diagnostic.source);
  });
  if (sources.some((source) => !rootIds.has(source.rootId))) {
    fail("AH-REPORT-UNKNOWN-REFERENCE", "SourceRef names an unknown root");
  }

  for (const finding of findings) {
    for (const evidence of finding.evidence) {
      if (evidence.kind === "items" && evidence.itemIds.some((id) => !itemIds.has(id))) {
        fail("AH-REPORT-UNKNOWN-REFERENCE", "item evidence names an unknown item");
      }
    }
  }
};
