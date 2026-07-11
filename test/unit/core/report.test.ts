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
  evidence: [{ kind: "source", source: source("z") }],
  recommendation: "Recommendation",
  manualSteps: [],
  confidence: "high",
  actionable: true,
  ...overrides,
});

const diagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => {
  const code = overrides.code ?? "read_failed";
  const messages: Record<Diagnostic["code"], string> = {
    read_failed: "A source could not be read.",
    parse_error: "A source could not be parsed.",
    unsafe_reference: "An unsafe reference was rejected.",
    limit_exceeded: "A scan safety limit was exceeded.",
    unsupported_value: "An unsupported value was encountered.",
    adapter_failed: "An adapter failed during scanning.",
  };
  return {
    severity: "warning",
    agent: "hermes",
    source: source("z"),
    coverageImpact: "partial",
    ...overrides,
    code,
    message: overrides.message ?? messages[code],
  };
};

const baseInput = () => ({
  tool: { name: "agent-hygiene-cli" as const, version: "0.1.0" },
  scan: {
    startedAt: "2026-07-10T00:00:00.000Z",
    durationMs: 12,
    platform: "win32" as const,
    projectRoot: source("."),
    selectedWorkingDirectory: source("."),
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
    input.inventory = [inventoryItem({ itemId: "item-codex", agent: "codex" }), inventoryItem({ itemId: "item-hermes" })];
    input.findings = [finding({ instanceId: "one", severity: "error" }), finding({ instanceId: "two", severity: "warning", evidence: [{ kind: "source", source: source("y") }] })];
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
      { agent: "codex", inventoryCount: 1, diagnosticCodes: [] },
      { agent: "hermes", inventoryCount: 1, diagnosticCodes: ["read_failed", "parse_error"] },
    ]);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.summary.findings)).toBe(true);
  });

  it("sorts every report collection deterministically", () => {
    const input = baseInput();
    input.inventory = [
      inventoryItem(),
      inventoryItem({
        itemId: "item-b",
        agent: "codex",
        kind: "mcp",
        name: "beta",
        source: source("b"),
        facts: { type: "mcp", transport: "stdio", credentialLikeFields: [] },
      }),
      inventoryItem({ itemId: "item-a", agent: "codex", kind: "skill", name: "alpha", source: source("z", "z") }),
      inventoryItem({ itemId: "item-c", agent: "codex", kind: "skill", name: "ALPHA", source: source("a") }),
    ];
    input.findings = [
      finding(),
      finding({ ruleId: "rule-b", instanceId: "b", severity: "error" }),
      finding({ ruleId: "rule-a", instanceId: "z", severity: "error", evidence: [{ kind: "source", source: source("z", "z") }] }),
      finding({ ruleId: "rule-a", instanceId: "a", severity: "error", evidence: [{ kind: "source", source: source("a") }] }),
      finding({ ruleId: "rule-w", instanceId: "w", severity: "warning" }),
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
    expect(report.inventory.map((item) => `${item.kind}:${item.name}:${item.source.relativePath}`)).toEqual([
      "skill:ALPHA:a", "skill:alpha:z", "mcp:beta:b", "skill:Zulu:z/SKILL.md",
    ]);
    expect(report.findings.map((item) => `${item.severity}:${item.ruleId}`)).toEqual([
      "error:rule-a", "error:rule-a", "error:rule-b", "warning:rule-w", "info:rule-z",
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
      { kind: "items" as const, itemIds: ["b", "a"] },
      { kind: "source" as const, source: source("config.toml") },
    ];
    const first = createFindingInstanceId("AH001", evidence);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(createFindingInstanceId("AH001", [...evidence].reverse())).toBe(first);
  });

  it("requires a supported platform and safe scan SourceRefs, including dot roots", () => {
    const input = baseInput();
    expect(buildReport(input).scan.projectRoot.relativePath).toBe(".");

    const badPlatform = baseInput();
    Object.assign(badPlatform.scan, { platform: "android" });
    expect(() => buildReport(badPlatform)).toThrowError(/AH-REPORT-INVALID-SHAPE/);

    for (const relativePath of ["\\bad", "/bad", "C:/bad", "../bad", "a/../bad"]) {
      const badSource = baseInput();
      badSource.scan.projectRoot = source(relativePath);
      expect(() => buildReport(badSource)).toThrowError(/AH-REPORT-INVALID-SOURCE-REF/);
    }
  });

  it("recomputes adapter metadata solely from report contents", () => {
    const input = baseInput();
    Object.assign(input.adapters[0]!, { diagnosticCodes: ["parse_error"] });
    Object.assign(input.adapters[1]!, { diagnosticCodes: ["adapter_failed"] });
    input.inventory = [inventoryItem({ agent: "codex" })];
    input.diagnostics = [diagnostic({ agent: "codex", code: "read_failed" })];

    expect(buildReport(input).adapters).toMatchObject([
      { agent: "codex", inventoryCount: 1, diagnosticCodes: ["read_failed"] },
      { agent: "hermes", inventoryCount: 0, diagnosticCodes: [] },
    ]);
  });

  it("replaces caller IDs with deterministic lowercase SHA-256 IDs", () => {
    const input = baseInput();
    input.inventory = [inventoryItem({ itemId: "caller-value" })];
    input.findings = [finding({
      instanceId: "caller-value",
      evidence: [
        { kind: "items", itemIds: ["caller-value"] },
        { kind: "source", source: source("z") },
      ],
    })];

    const report = buildReport(input);
    expect(report.inventory[0]?.itemId).toMatch(/^[0-9a-f]{64}$/);
    expect(report.inventory[0]?.itemId).not.toBe("caller-value");
    expect(report.findings[0]?.instanceId).toMatch(/^[0-9a-f]{64}$/);
    expect(report.findings[0]?.instanceId).not.toBe("caller-value");

    const reversed = baseInput();
    reversed.inventory = [inventoryItem({ itemId: "caller-value" })];
    reversed.findings = [finding({
      evidence: [
        { kind: "source", source: source("z") },
        { kind: "items", itemIds: ["caller-value"] },
      ],
    })];
    expect(buildReport(reversed).findings[0]?.instanceId).toBe(report.findings[0]?.instanceId);
  });

  it("rejects diagnostics outside the exact catalog shape", () => {
    const invalidDiagnostics: unknown[] = [
      { ...diagnostic(), stack: "secret" },
      { ...diagnostic(), agent: "other" },
      { ...diagnostic(), line: 0 },
      { ...diagnostic(), column: -1 },
      { ...diagnostic(), message: "arbitrary" },
      { ...diagnostic(), source: source("../bad") },
    ];
    for (const invalid of invalidDiagnostics) {
      const input = baseInput();
      input.diagnostics = [invalid as Diagnostic];
      expect(() => buildReport(input)).toThrowError(/AH-REPORT-INVALID-DIAGNOSTIC/);
    }
  });

  it("freezes mutable descendants below already frozen parents", () => {
    const nestedSource = source("z");
    const nestedFacts = {
      type: "skill" as const, frontmatter: "valid" as const, nameUsable: true, descriptionUsable: true,
    };
    const item = Object.freeze(inventoryItem({ source: nestedSource, facts: nestedFacts }));
    const evidence = Object.freeze({ kind: "source" as const, source: source("z") });
    const input = baseInput();
    input.inventory = [item];
    input.findings = [finding({ evidence: [evidence] })];

    const report = buildReport(input);
    expect(Object.isFrozen(report.inventory[0]?.source)).toBe(true);
    expect(Object.isFrozen(report.inventory[0]?.facts)).toBe(true);
    expect(Object.isFrozen(report.findings[0]?.evidence)).toBe(true);
    expect(Object.isFrozen(report.findings[0]?.evidence[0])).toBe(true);
  });

  it.each([
    ["unknown root key", (input: ReturnType<typeof baseInput>) => { Object.assign(input.roots[0]!, { surprise: true }); }],
    ["mismatched facts", (input: ReturnType<typeof baseInput>) => { input.inventory = [inventoryItem({ kind: "mcp" })]; }],
    ["duplicate root", (input: ReturnType<typeof baseInput>) => { input.roots = [input.roots[0]!, input.roots[0]!]; }],
    ["duplicate item", (input: ReturnType<typeof baseInput>) => {
      const item = inventoryItem();
      input.inventory = [item, item];
    }],
    ["duplicate finding", (input: ReturnType<typeof baseInput>) => {
      const first = finding();
      input.findings = [first, first];
    }],
    ["unknown source root", (input: ReturnType<typeof baseInput>) => {
      input.inventory = [inventoryItem({ source: source("file", "missing") })];
    }],
    ["unknown evidence item", (input: ReturnType<typeof baseInput>) => {
      input.findings = [finding({ evidence: [{ kind: "items", itemIds: ["missing"] }] })];
    }],
  ])("rejects closed-contract invariant: %s", (_label, mutate) => {
    const input = baseInput();
    mutate(input);
    expect(() => buildReport(input)).toThrowError(/AH-REPORT-/);
  });
});
