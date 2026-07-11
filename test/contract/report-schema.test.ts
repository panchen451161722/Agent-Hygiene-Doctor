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
    projectRoot: { rootId: "project", relativePath: "." },
    selectedWorkingDirectory: { rootId: "project", relativePath: "." },
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
    evidence: [{ kind: "metric", metric: "bytes", value: 10, threshold: 5 }], recommendation: "Fix", manualSteps: [], confidence: "high", actionable: true,
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
      kind: "source", source: { rootId: "project", relativePath: "file" }, field: "name",
    } as unknown as { surprise?: boolean };
    expect(validate(report)).toBe(false);
  });

  it("enforces platform, SourceRef scan roots, and SHA-256 IDs", async () => {
    const schema = JSON.parse(await readFile(new URL("../../schema/report-v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const valid = clone(makeReport()) as unknown as MutableReportShape & {
      scan: { platform: string; projectRoot: { relativePath: string } };
      inventory: [{ itemId: string; facts: { surprise?: boolean } }];
      findings: [{ instanceId: string; evidence: [{ surprise?: boolean }] }];
    };
    valid.scan.projectRoot.relativePath = ".";
    expect(validate(valid), JSON.stringify(validate.errors)).toBe(true);

    for (const mutate of [
      (report: typeof valid) => { report.scan.platform = "android"; },
      (report: typeof valid) => { report.scan.projectRoot.relativePath = "../bad"; },
      (report: typeof valid) => { report.inventory[0].itemId = "not-a-hash"; },
      (report: typeof valid) => { report.findings[0].instanceId = "not-a-hash"; },
    ]) {
      const report = clone(valid);
      mutate(report);
      expect(validate(report)).toBe(false);
    }
  });

  it("accepts exact field evidence and rejects type as a discriminant", async () => {
    const schema = JSON.parse(await readFile(new URL("../../schema/report-v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const report = clone(makeReport()) as unknown as MutableReportShape;
    report.findings[0].evidence[0] = {
      kind: "field", source: { rootId: "project", relativePath: "file" }, field: "name",
    } as unknown as { surprise?: boolean };
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);

    report.findings[0].evidence[0] = {
      type: "field", source: { rootId: "project", relativePath: "file" }, field: "name",
    } as unknown as { surprise?: boolean };
    expect(validate(report)).toBe(false);
  });

  it("keeps facts and diagnostics isomorphic with runtime validation", async () => {
    const schema = JSON.parse(await readFile(new URL("../../schema/report-v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const factsMismatch = clone(makeReport()) as unknown as MutableReportShape & {
      inventory: [{ kind: string; facts: { surprise?: boolean } }];
    };
    factsMismatch.inventory[0].kind = "mcp";
    expect(validate(factsMismatch)).toBe(false);

    const badMessage = clone(makeReport()) as unknown as MutableReportShape & {
      diagnostics: [{ message: string; stack?: string }];
    };
    badMessage.diagnostics[0].message = "arbitrary";
    expect(validate(badMessage)).toBe(false);
    badMessage.diagnostics[0].message = "A source could not be read.";
    badMessage.diagnostics[0].stack = "secret";
    expect(validate(badMessage)).toBe(false);
  });

  it("never accepts a raw Error diagnostic", async () => {
    const schema = JSON.parse(await readFile(new URL("../../schema/report-v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const report = clone(makeReport()) as unknown as MutableReportShape;
    report.diagnostics = [new Error("boom")];
    expect(validate(report)).toBe(false);
  });
});
