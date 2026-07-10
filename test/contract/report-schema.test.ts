import { readFile } from "node:fs/promises";

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { buildReport } from "../../src/core/report.js";

const makeReport = () => buildReport({
  tool: { name: "agent-hygiene-cli", version: "0.1.0" },
  scan: {
    startedAt: "2026-07-10T00:00:00.000Z",
    durationMs: 1,
    platform: "linux",
    projectRoot: "/repo",
    selectedWorkingDirectory: "/repo",
    selectedAgents: ["codex"],
    limits: undefined,
    coverage: "complete",
  },
  roots: [{ id: "project", kind: "project", alias: "project" }],
  adapters: [{ agent: "codex", status: "complete", coverage: "complete", inventoryCount: 0, diagnosticCodes: [] }],
  summary: { inventoryCount: 0, findings: { info: 0, warning: 0, error: 0 }, diagnostics: { info: 0, warning: 0, error: 0 } },
  inventory: [{
    itemId: "item",
    agent: "codex",
    kind: "skill",
    name: "Skill",
    source: { rootId: "project", relativePath: "skills/SKILL.md" },
    scope: "project",
    status: "active",
    loading: "conditional",
    facts: { type: "skill", frontmatter: "valid", nameUsable: true, descriptionUsable: true },
  }],
  findings: [{
    ruleId: "AH001", instanceId: "instance", severity: "warning", category: "hygiene", title: "Title", impact: "Impact",
    evidence: [{ type: "metric", metric: "bytes", value: 10, threshold: 5 }], recommendation: "Fix", manualSteps: [], confidence: "high", actionable: true,
  }],
  diagnostics: [{ code: "read_failed", severity: "warning", agent: "codex", source: { rootId: "project", relativePath: "bad" }, coverageImpact: "partial", message: "A source could not be read." }],
});

const clone = <T>(value: T): T => structuredClone(value);

interface MutableReportShape {
  surprise?: boolean;
  scan: { surprise?: boolean };
  inventory: [{ facts: { surprise?: boolean } }];
  findings: [{ evidence: [{ surprise?: boolean }] }];
  diagnostics: unknown[];
}

const additionalPropertyCases: readonly [string, (report: MutableReportShape) => void][] = [
  ["top level", (report) => { report.surprise = true; }],
  ["nested object", (report) => { report.scan.surprise = true; }],
  ["fact", (report) => { report.inventory[0].facts.surprise = true; }],
  ["evidence", (report) => { report.findings[0].evidence[0].surprise = true; }],
];

describe("report-v1 JSON schema", () => {
  it("accepts a built report loaded against the on-disk Draft 2020-12 schema", async () => {
    const schema = JSON.parse(await readFile(new URL("../../schema/report-v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    expect(validate(makeReport()), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(additionalPropertyCases)(
    "rejects additional properties at %s", async (_label, mutate) => {
    const schema = JSON.parse(await readFile(new URL("../../schema/report-v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const report = clone(makeReport()) as unknown as MutableReportShape;
    mutate(report);
    expect(validate(report)).toBe(false);
  });

  it("keeps evidence variants exact", async () => {
    const schema = JSON.parse(await readFile(new URL("../../schema/report-v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const report = clone(makeReport()) as unknown as MutableReportShape;
    report.findings[0].evidence[0] = {
      type: "source", source: { rootId: "project", relativePath: "file" }, field: "name",
    } as unknown as { surprise?: boolean };
    expect(validate(report)).toBe(false);
  });

  it("never accepts a raw Error diagnostic", async () => {
    const schema = JSON.parse(await readFile(new URL("../../schema/report-v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const report = clone(makeReport()) as unknown as MutableReportShape;
    report.diagnostics = [new Error("boom")];
    expect(validate(report)).toBe(false);
  });
});
