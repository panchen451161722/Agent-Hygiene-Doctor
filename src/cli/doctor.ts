import { resolve } from "node:path";
import { AGENT_IDS, type AgentId } from "../core/agent.js";
import { createScanContext } from "../core/context.js";
import { nodeFsBackend } from "../core/fs/backend.js";
import { runAdapters } from "../core/orchestrator.js";
import { buildReport } from "../core/report.js";
import { analyzeConfiguration } from "../analyzers/configuration.js";
import { analyzeMcp } from "../analyzers/mcp.js";
import { adapter as claudeAdapter } from "../adapters/claude/adapter.js";
import { adapter as codexAdapter } from "../adapters/codex/adapter.js";
import { adapter as hermesAdapter } from "../adapters/hermes/adapter.js";
import { renderJson } from "../reporters/json.js";
import { renderTerminal } from "../reporters/terminal.js";
import type { CliRuntime } from "./main.js";
import type { DoctorCliOptions } from "./options.js";

const TOOL_VERSION = "1.2.0";
const platform = (): "win32" | "darwin" | "linux" => process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
const selectedAgents = (options: DoctorCliOptions): readonly AgentId[] => options.agents.length > 0 ? options.agents : AGENT_IDS;
const metadataFileSystem = {
  lstat: async (path: string) => {
    try {
      const stat = await nodeFsBackend.lstat(path);
      return stat.type === "file" ? "file" as const : stat.type === "directory" ? "directory" as const : null;
    } catch {
      return null;
    }
  },
};

export const runDoctor = (options: DoctorCliOptions, runtime: CliRuntime): number => {
  const agents = selectedAgents(options);
  const now = new Date().toISOString();
  const report = buildReport({
    tool: { name: "agent-hygiene-cli", version: TOOL_VERSION },
    scan: { startedAt: now, durationMs: 0, platform: platform(), projectRoot: { rootId: "project", relativePath: "." }, selectedWorkingDirectory: { rootId: "project", relativePath: "." }, selectedAgents: agents, coverage: "unknown" },
    roots: [{ id: "home", kind: "home", alias: "~" }, { id: "project", kind: "project", alias: "<project>" }],
    adapters: agents.map((agent) => ({ agent, status: "not-detected", coverage: "unknown", inventoryCount: 0, diagnosticCodes: [] })),
    inventory: [], findings: [], diagnostics: [],
    summary: { inventoryCount: 0, findings: { info: 0, warning: 0, error: 0 }, diagnostics: { info: 0, warning: 0, error: 0 } },
  });
  runtime.writeStdout(options.format === "json" ? `${renderJson(report)}\n` : renderTerminal(report));
  return 0;
};

export const runDoctorAsync = async (options: DoctorCliOptions, runtime: CliRuntime): Promise<number> => {
  const agents = selectedAgents(options);
  const projectDirectory = resolve(process.cwd(), options.project ?? ".");
  try {
    const stat = await nodeFsBackend.lstat(projectDirectory);
    if (stat.type !== "directory") throw new Error("not a directory");
  } catch {
    runtime.writeStderr("fatal: project directory is unavailable\n");
    return 2;
  }
  const started = Date.now();
  const context = await createScanContext({
    platform: platform(), selectedWorkingDirectory: projectDirectory, projectRoot: projectDirectory,
    environment: process.env, fs: metadataFileSystem, backend: nodeFsBackend, toolVersion: TOOL_VERSION,
  });
  const adapters = { codex: codexAdapter, claude: claudeAdapter, hermes: hermesAdapter };
  const results = await runAdapters(agents.map((agent) => adapters[agent]), context);
  const inventory = results.flatMap((result) => result.inventory);
  const diagnostics = results.flatMap((result) => result.diagnostics);
  const findings = [...analyzeConfiguration(inventory), ...analyzeMcp(inventory)];
  const report = buildReport({
    tool: { name: "agent-hygiene-cli", version: TOOL_VERSION },
    scan: { startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, platform: context.platform, projectRoot: { rootId: "project", relativePath: "." }, selectedWorkingDirectory: { rootId: "project", relativePath: "." }, selectedAgents: agents, coverage: "unknown" },
    roots: context.roots.descriptors(),
    adapters: results.map((result) => ({ agent: result.agent, status: result.coverage === "complete" ? "complete" : result.coverage === "partial" ? "partial" : "not-detected", coverage: result.coverage, inventoryCount: 0, diagnosticCodes: [] })),
    inventory, findings, diagnostics,
    summary: { inventoryCount: 0, findings: { info: 0, warning: 0, error: 0 }, diagnostics: { info: 0, warning: 0, error: 0 } },
  });
  runtime.writeStdout(options.format === "json" ? `${renderJson(report)}\n` : renderTerminal(report));
  const threshold = options.failOn === "warning" ? new Set(["warning", "error"]) : new Set(["error"]);
  return report.findings.some((finding) => threshold.has(finding.severity)) ? 1 : 0;
};