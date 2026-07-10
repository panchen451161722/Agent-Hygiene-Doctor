import { describe, expect, it } from "vitest";

import { aggregateCoverage } from "../../../src/core/coverage.js";
import { createFindingInstanceId, createItemId } from "../../../src/core/report.js";
import { buildReport } from "../../../src/core/report.js";
import type { Diagnostic } from "../../../src/core/diagnostic.js";
import type { Finding } from "../../../src/core/finding.js";
import type { InventoryItem } from "../../../src/core/inventory.js";

const source = (relativePath: string, rootId = "project") => ({ rootId, relativePath });

const inventoryItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  itemId: "item-z",
  agent: "hermes",
  kind: "skill",
  name: "Zulu",
  source: source("z/SKILL.md"),
  scope: "project",
  status: "active",
  loading: "conditional",
  facts: {
    type: "skill",
    frontmatter: "valid",
    nameUsable: true,
    descriptionUsable: true,
  },
  ...overrides,
});

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  ruleId: "rule-z",
  instanceId: "instance-z",
  severity: "info",
  category: "hygiene",
  title: "Title",
  impact: "Impact",
  evidence: [{ type: "source", source: source("z") }],
  recommendation: "Recommendation",
  manualSteps: [],
  confidence: "high",
  actionable: true,
  ...overrides,
});

const diagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  code: "read_failed",
  severity: "warning",
  agent: "hermes",
  source: source("z"),
  coverageImpact: "partial",
  message: "A source could not be read.",
  ...overrides,
});

const baseInput = () => ({
  tool: { name: "agent-hygiene-cli" as const, version: "0.1.0" },
  scan: {
    startedAt: "2026-07-10T00:00:00.000Z",
    durationMs: 12,
    platform: "win32",
    projectRoot: "C:/repo",
    selectedWorkingDirectory: "C:/repo",
    selectedAgents: ["hermes", "codex"] as const,
    coverage: "complete" as const,
  },
  roots: [
    { id: "z", kind: "external" as const, alias: "z" },
    { id: "project", kind: "project" as const, alias: "project" },
  ],
  adapters: [
    {
      agent: "hermes" as const,
      status: "complete" as const,
      coverage: "complete" as const,
      inventoryCount: 99,
      diagnosticCodes: ["parse_error" as const, "read_failed" as const],
    },
    {
      agent: "codex" as const,
      status: "partial" as const,
      coverage: "partial" as const,
      inventoryCount: 99,
      diagnosticCodes: ["read_failed" as const],
    },
  ],
  summary: {
    inventoryCount: 999,
    findings: { info: 999, warning: 999, error: 999 },
    diagnostics: { info: 999, warning: 999, error: 999 },
  },
  inventory: [] as InventoryItem[],
  findings: [] as Finding[],
  diagnostics: [] as Diagnostic[],
});

describe("report contract", () => {
  it("builds version 1 and recomputes summary, adapter counts, codes, and coverage", () => {
    const input = baseInput();
    input.inventory = [inventoryItem({ agent: "codex" }), inventoryItem()];
    input.findings = [finding({ severity: "error" }), finding({ severity: "warning" })];
    input.diagnostics = [diagnostic(), diagnostic({ severity: "error", code: "parse_error", coverageImpact: "unknown" })];

    const report = buildReport(input);

    expect(report.schemaVersion).toBe(1);
    expect(report.summary).toEqual({
      inventoryCount: 2,
      findings: { info: 0, warning: 1, error: 1 },
      diagnostics: { info: 0, warning: 1, error: 1 },
    });
    expect(report.scan.coverage).toBe("unknown");
    expect(report.adapters).toMatchObject([
      { agent: "codex", inventoryCount: 1, diagnosticCodes: ["read_failed"] },
      { agent: "hermes", inventoryCount: 1, diagnosticCodes: ["read_failed", "parse_error"] },
    ]);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.summary.findings)).toBe(true);
  });

  it("sorts every report collection deterministically", () => {
    const input = baseInput();
    input.inventory = [
      inventoryItem(),
      inventoryItem({ itemId: "item-b", agent: "codex", kind: "mcp", name: "beta", source: source("b") }),
      inventoryItem({ itemId: "item-a", agent: "codex", kind: "skill", name: "alpha", source: source("z", "z") }),
      inventoryItem({ itemId: "item-c", agent: "codex", kind: "skill", name: "ALPHA", source: source("a") }),
    ];
    input.findings = [
      finding(),
      finding({ ruleId: "rule-b", instanceId: "b", severity: "error" }),
      finding({ ruleId: "rule-a", instanceId: "z", severity: "error" }),
      finding({ ruleId: "rule-a", instanceId: "a", severity: "error" }),
      finding({ ruleId: "rule-w", severity: "warning" }),
    ];
    input.diagnostics = [
      diagnostic(),
      diagnostic({ agent: "codex", code: "read_failed", source: source("b"), line: 2, column: 2 }),
      diagnostic({ agent: "codex", code: "parse_error", source: source("a"), line: 3 }),
      diagnostic({ agent: "codex", code: "parse_error", source: source("a"), line: 2 }),
    ];

    const report = buildReport(input);

    expect(report.scan.selectedAgents).toEqual(["codex", "hermes"]);
    expect(report.roots.map((root) => root.id)).toEqual(["project", "z"]);
    expect(report.adapters.map((adapter) => adapter.agent)).toEqual(["codex", "hermes"]);
    expect(report.inventory.map((item) => item.itemId)).toEqual(["item-c", "item-a", "item-b", "item-z"]);
    expect(report.findings.map((item) => `${item.severity}:${item.ruleId}:${item.instanceId}`)).toEqual([
      "error:rule-a:a", "error:rule-a:z", "error:rule-b:b", "warning:rule-w:instance-z", "info:rule-z:instance-z",
    ]);
    expect(report.diagnostics.map((item) => `${item.agent}:${item.code}:${item.source?.relativePath}:${item.line ?? 0}`)).toEqual([
      "codex:parse_error:a:2", "codex:parse_error:a:3", "codex:read_failed:b:2", "hermes:read_failed:z:0",
    ]);
  });

  it("aggregates coverage by unknown then partial then complete", () => {
    expect(aggregateCoverage(["complete", "complete"])).toBe("complete");
    expect(aggregateCoverage(["complete", "partial"])).toBe("partial");
    expect(aggregateCoverage(["partial", "unknown"])).toBe("unknown");
  });

  it("rejects non-catalog diagnostics", () => {
    const input = baseInput();
    input.diagnostics = [new Error("boom") as unknown as Diagnostic];
    expect(() => buildReport(input)).toThrowError(/AH-REPORT-INVALID-DIAGNOSTIC/);
    input.diagnostics = [{ surprise: true } as unknown as Diagnostic];
    expect(() => buildReport(input)).toThrowError(/AH-REPORT-INVALID-DIAGNOSTIC/);
  });

  it.each(["/absolute", "C:/absolute", "../escape", "a/../../escape", "back\\slash"])(
    "rejects unsafe report path %s",
    (relativePath) => {
      const input = baseInput();
      input.inventory = [inventoryItem({ source: source(relativePath) })];
      expect(() => buildReport(input)).toThrowError(/AH-REPORT-INVALID-SOURCE-REF/);
    },
  );

  it("accepts slash-separated relative report paths", () => {
    const input = baseInput();
    input.inventory = [inventoryItem({ source: source("nested/SKILL.md") })];
    expect(buildReport(input).inventory[0]?.source.relativePath).toBe("nested/SKILL.md");
  });

  it("generates stable lowercase SHA-256 item and finding IDs", () => {
    expect(createItemId("codex", "skill", "  My   Skill ", source("skills/My/SKILL.md"))).toBe(
      "cc4d5777346a462e4e0dc0682e32e36e2943710d0c184d384402246f21f45cc2",
    );
    const evidence = [
      { type: "items" as const, itemIds: ["b", "a"] },
      { type: "source" as const, source: source("config.toml") },
    ];
    const first = createFindingInstanceId("AH001", evidence);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(createFindingInstanceId("AH001", [...evidence].reverse())).toBe(first);
  });
});
