import { AGENT_IDS, type AgentId } from "../core/agent.js";
import { buildReport } from "../core/report.js";
import { scanLocal } from "../scan/local.js";
import { renderJson } from "../reporters/json.js";
import { renderTerminal } from "../reporters/terminal.js";
import type { CliRuntime } from "./main.js";
import type { DoctorCliOptions } from "./options.js";

const TOOL_VERSION = "2.2.0";
const platform = (): "win32" | "darwin" | "linux" => process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
const selectedAgents = (options: DoctorCliOptions): readonly AgentId[] => options.agents.length > 0 ? options.agents : AGENT_IDS;
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
  let report;
  try {
    ({ report } = await scanLocal({ agents: selectedAgents(options), ...(options.project === undefined ? {} : { project: options.project }) }));
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "AH-PROJECT-UNAVAILABLE") throw error;
    runtime.writeStderr("fatal: project directory is unavailable\n");
    return 2;
  }
  runtime.writeStdout(options.format === "json" ? `${renderJson(report)}\n` : renderTerminal(report));
  const threshold = options.failOn === "warning" ? new Set(["warning", "error"]) : new Set(["error"]);
  return report.findings.some((finding) => threshold.has(finding.severity)) ? 1 : 0;
};
