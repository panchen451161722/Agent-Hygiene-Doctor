import { AGENT_IDS, type AgentId } from "../core/agent.js";
import { buildReport } from "../core/report.js";
import type { CliRuntime } from "./main.js";
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


