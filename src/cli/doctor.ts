import { AGENT_IDS, type AgentId } from "../core/agent.js";
import { buildReport } from "../core/report.js";
import type { CliRuntime } from "./main.js";

import { nodeFsBackend } from "../core/fs/backend.js";
import { createScanContext } from "../core/context.js";
import { runAdapters } from "../core/orchestrator.js";
import { adapter as codexAdapter } from "../adapters/codex/adapter.js";
import { adapter as claudeAdapter } from "../adapters/claude/adapter.js";
import { adapter as hermesAdapter } from "../adapters/hermes/adapter.js";
import type { DoctorCliOptions } from "./options.js";
import { renderJson } from "../reporters/json.js";
import { renderTerminal } from "../reporters/terminal.js";

const platform = (): "win32" | "darwin" | "linux" => process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";

export const runDoctor = (options: DoctorCliOptions, runtime: CliRuntime): number => {
  const selectedAgents: readonly AgentId[] = options.agents.length > 0 ? options.agents : AGENT_IDS;
  const now = new Date().toISOString();
  const report = buildReport({
    tool: { name: "agent-hygiene-cli", version: "0.1.0" },
    scan: {
      startedAt: now,
      durationMs: 0,
      platform: platform(),
      projectRoot: { rootId: "project", relativePath: "." },
      selectedWorkingDirectory: { rootId: "project", relativePath: "." },
      selectedAgents,
      coverage: "unknown",
    },
    roots: [
      { id: "home", kind: "home", alias: "~" },
      { id: "project", kind: "project", alias: "<project>" },
    ],
    adapters: selectedAgents.map((agent) => ({ agent, status: "not-detected", coverage: "unknown", inventoryCount: 0, diagnosticCodes: [] })),
    inventory: [],
    findings: [],
    diagnostics: [],
    summary: { inventoryCount: 0, findings: { info: 0, warning: 0, error: 0 }, diagnostics: { info: 0, warning: 0, error: 0 } },
  });
  runtime.writeStdout(options.format === "json" ? `${renderJson(report)}\n` : renderTerminal(report));
  return 0;
};



export const runDoctorAsync = async (options: DoctorCliOptions, runtime: CliRuntime): Promise<number> => {
  const selectedAgents: readonly AgentId[] = options.agents.length > 0 ? options.agents : AGENT_IDS;
  const cwd = process.cwd(); const platformName = platform();
  const fs = { lstat: async (path: string) => { try { const stat = await nodeFsBackend.lstat(path); return stat.type === "file" ? "file" as const : stat.type === "directory" ? "directory" as const : null; } catch { return null; } } };
  const context = await createScanContext({ platform: platformName, selectedWorkingDirectory: cwd, projectRoot: cwd, environment: process.env, fs, backend: nodeFsBackend, toolVersion: "0.1.0" });
  const allAdapters = { codex: codexAdapter, claude: claudeAdapter, hermes: hermesAdapter };
  const results = await runAdapters(selectedAgents.map((agent) => allAdapters[agent]), context);
  const inventory = results.flatMap((result) => result.inventory); const diagnostics = results.flatMap((result) => result.diagnostics);
  const report = buildReport({ tool: { name: "agent-hygiene-cli", version: "0.1.0" }, scan: { startedAt: new Date().toISOString(), durationMs: 0, platform: platformName, projectRoot: { rootId: "project", relativePath: "." }, selectedWorkingDirectory: { rootId: "project", relativePath: "." }, selectedAgents, coverage: "unknown" }, roots: [{ id: "home", kind: "home", alias: "~" }, { id: "project", kind: "project", alias: "<project>" }], adapters: results.map((result) => ({ agent: result.agent, status: result.coverage === "complete" ? "complete" : result.coverage === "unknown" ? "not-detected" : "partial", coverage: result.coverage, inventoryCount: 0, diagnosticCodes: [] })), inventory, findings: [], diagnostics, summary: { inventoryCount: 0, findings: { info: 0, warning: 0, error: 0 }, diagnostics: { info: 0, warning: 0, error: 0 } } });
  runtime.writeStdout(options.format === "json" ? `${renderJson(report)}\n` : renderTerminal(report)); return 0;
};



