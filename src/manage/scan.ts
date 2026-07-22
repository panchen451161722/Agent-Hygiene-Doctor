import { resolve } from "node:path";

import { AGENT_IDS, type AgentId } from "../core/agent.js";
import { createScanContext } from "../core/context.js";
import { nodeFsBackend } from "../core/fs/backend.js";
import { runAdapters } from "../core/orchestrator.js";
import { buildReport, type ReportV1 } from "../core/report.js";
import { analyzeConfiguration } from "../analyzers/configuration.js";
import { analyzeMcp } from "../analyzers/mcp.js";
import { adapter as claudeAdapter } from "../adapters/claude/adapter.js";
import { adapter as codexAdapter } from "../adapters/codex/adapter.js";
import { adapter as hermesAdapter } from "../adapters/hermes/adapter.js";

export interface ManageScanOptions {
  readonly agents: readonly AgentId[];
  readonly project?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

const TOOL_VERSION = "2.0.2";
const platform = (): "win32" | "darwin" | "linux" => process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
const metadataFileSystem = {
  lstat: async (path: string) => {
    try {
      const stat = await nodeFsBackend.lstat(path);
      return stat.type === "file" ? "file" as const : stat.type === "directory" ? "directory" as const : null;
    } catch { return null; }
  },
};

export const scanForManagement = async (options: ManageScanOptions): Promise<{ readonly report: ReportV1; readonly projectDirectory: string }> => {
  const agents = options.agents.length === 0 ? AGENT_IDS : options.agents;
  const projectDirectory = resolve(process.cwd(), options.project ?? ".");
  const stat = await nodeFsBackend.lstat(projectDirectory).catch(() => undefined);
  if (stat?.type !== "directory") throw new Error("AH-PROJECT-UNAVAILABLE");
  const started = Date.now();
  const context = await createScanContext({
    platform: platform(), selectedWorkingDirectory: projectDirectory, projectRoot: projectDirectory,
    environment: options.environment ?? process.env, fs: metadataFileSystem, backend: nodeFsBackend, toolVersion: TOOL_VERSION,
  });
  const adapters = { codex: codexAdapter, claude: claudeAdapter, hermes: hermesAdapter };
  const results = await runAdapters(agents.map((agent) => adapters[agent]), context);
  const inventory = results.flatMap((result) => result.inventory);
  const diagnostics = results.flatMap((result) => result.diagnostics);
  const findings = [...analyzeConfiguration(inventory), ...analyzeMcp(inventory)];
  return {
    projectDirectory,
    report: buildReport({
      tool: { name: "agent-hygiene-cli", version: TOOL_VERSION },
      scan: { startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, platform: context.platform, projectRoot: { rootId: "project", relativePath: "." }, selectedWorkingDirectory: { rootId: "project", relativePath: "." }, selectedAgents: agents, coverage: "unknown" },
      roots: context.roots.descriptors(),
      adapters: results.map((result) => ({ agent: result.agent, status: result.coverage === "complete" ? "complete" : result.coverage === "partial" ? "partial" : "not-detected", coverage: result.coverage, inventoryCount: 0, diagnosticCodes: [] })),
      inventory, findings, diagnostics,
      summary: { inventoryCount: 0, findings: { info: 0, warning: 0, error: 0 }, diagnostics: { info: 0, warning: 0, error: 0 } },
    }),
  };
};
