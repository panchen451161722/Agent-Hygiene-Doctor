import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctorAsync } from "../../src/cli/doctor.js";
import type { CliRuntime } from "../../src/cli/main.js";

const fixture = resolve("test/fixtures/doctor-project");
const mcpFixture = resolve("test/fixtures/mcp-project");
const runtime = () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, value: { writeStdout: (text: string) => stdout.push(text), writeStderr: (text: string) => stderr.push(text) } satisfies CliRuntime };
};

describe("doctor CLI runtime", () => {
  it("honors selected agents and JSON output", async () => {
    const capture = runtime();
    await expect(runDoctorAsync({ command: "doctor", agents: ["codex", "claude"], format: "json", agentMode: false, interactive: true, color: true, failOn: "error", verbose: false }, capture.value)).resolves.toBe(0);
    const report = JSON.parse(capture.stdout.join("")) as { scan: { selectedAgents: string[] }; adapters: { agent: string }[] };
    expect(report.scan.selectedAgents).toEqual(["codex", "claude"]);
    expect(report.adapters.map((adapter) => adapter.agent)).toEqual(["codex", "claude"]);
    expect(capture.stderr).toEqual([]);
  });

  it("renders useful terminal details", async () => {
    const capture = runtime();
    await expect(runDoctorAsync({ command: "doctor", agents: ["codex"], project: fixture, format: "terminal", agentMode: false, interactive: true, color: true, failOn: "error", verbose: false }, capture.value)).resolves.toBe(0);
    const output = capture.stdout.join("");
    expect(output).toContain("Adapters:\n  codex:");
    expect(output).toContain("Inventory:");
    expect(output).toContain("[codex] instruction AGENTS.md");
    expect(output).toContain("Findings:");
    expect(output).toContain("Diagnostics:");
    expect(capture.stderr).toEqual([]);
  });

  it("uses the requested project and applies fail-on warning", async () => {
    const capture = runtime();
    const exitCode = await runDoctorAsync({ command: "doctor", agents: ["codex"], project: fixture, format: "json", agentMode: false, interactive: true, color: true, failOn: "warning", verbose: false }, capture.value);
    const report = JSON.parse(capture.stdout.join("")) as { inventory: { source: { rootId: string; relativePath: string } }[]; findings: { severity: string }[] };
    expect(exitCode).toBe(1);
    expect(report.inventory).toContainEqual(expect.objectContaining({ source: { rootId: "project", relativePath: ".codex/config.toml" } }));
    expect(report.findings).toContainEqual(expect.objectContaining({ severity: "warning" }));
  });

  it("returns warning exit status for MCP hygiene findings", async () => {
    const capture = runtime();
    const exitCode = await runDoctorAsync({ command: "doctor", agents: ["codex"], project: mcpFixture, format: "json", agentMode: false, interactive: true, color: true, failOn: "warning", verbose: false }, capture.value);
    const report = JSON.parse(capture.stdout.join("")) as { inventory: { kind: string; name: string }[]; findings: { ruleId: string }[] };
    expect(exitCode).toBe(1);
    expect(report.inventory).toContainEqual(expect.objectContaining({ kind: "mcp", name: "unpinned" }));
    expect(report.findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining(["mcp-package-unpinned", "mcp-plaintext-remote"]));
    expect(capture.stderr).toEqual([]);
  });

  it("keeps agent-mode JSON-only and rejects an unavailable project", async () => {
    const agentMode = runtime();
    await expect(runDoctorAsync({ command: "doctor", agents: [], format: "json", agentMode: true, interactive: false, color: false, failOn: "error", verbose: false }, agentMode.value)).resolves.toBe(0);
    expect(JSON.parse(agentMode.stdout.join(""))).toHaveProperty("schemaVersion", 1);
    expect(agentMode.stderr).toEqual([]);

    const missing = runtime();
    await expect(runDoctorAsync({ command: "doctor", agents: [], project: resolve("test/fixtures/missing-project"), format: "json", agentMode: false, interactive: true, color: true, failOn: "error", verbose: false }, missing.value)).resolves.toBe(2);
    expect(missing.stdout).toEqual([]);
    expect(missing.stderr.join("")).toContain("project directory is unavailable");
  });
});