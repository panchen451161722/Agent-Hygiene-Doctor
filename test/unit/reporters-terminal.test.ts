import { describe, expect, it } from "vitest";

import type { ReportV1 } from "../../src/core/report.js";
import { renderTerminal } from "../../src/reporters/terminal.js";

describe("terminal reporter safety", () => {
  it("aligns adapter and inventory fields into readable columns", () => {
    const report = {
      tool: { version: "2.1.0" },
      scan: { coverage: "partial" },
      summary: { inventoryCount: 2, findings: { info: 0, warning: 0, error: 0 }, diagnostics: { info: 0, warning: 0, error: 0 } },
      adapters: [
        { agent: "codex", status: "partial", coverage: "partial", inventoryCount: 2 },
        { agent: "claude", status: "not-detected", coverage: "unknown", inventoryCount: 0 },
      ],
      inventory: [
        { agent: "codex", kind: "mcp", name: "node_repl", status: "active", scope: "user", source: { rootId: "codex-home", relativePath: "config.toml" } },
        { agent: "codex", kind: "skill", name: "launch-website", status: "disabled", scope: "project", source: { rootId: "codex-home", relativePath: "skills/launch-website/SKILL.md" } },
      ],
      findings: [],
      diagnostics: [],
    } as unknown as ReportV1;

    const output = renderTerminal(report);
    expect(output).toContain([
      "  codex : partial      (partial), 2 item(s)",
      "  claude: not-detected (unknown), 0 item(s)",
    ].join("\n"));
    expect(output).toContain([
      "  [codex] mcp   node_repl      — active,   user    — codex-home:config.toml",
      "  [codex] skill launch-website — disabled, project — codex-home:skills/launch-website/SKILL.md",
    ].join("\n"));
  });

  it("renders artifact names and diagnostics without terminal control characters", () => {
    const report = {
      tool: { version: "1.1.0" },
      scan: { coverage: "complete" },
      summary: { inventoryCount: 1, findings: { info: 0, warning: 0, error: 0 }, diagnostics: { info: 0, warning: 1, error: 0 } },
      adapters: [],
      inventory: [{ agent: "codex", kind: "mcp", name: "evil\u001b[31m\nspoof", status: "active", scope: "project", source: { rootId: "project", relativePath: "safe/config.toml" } }],
      findings: [],
      diagnostics: [{ severity: "warning", code: "read_failed", message: "bad\u001b[2J\nmessage", source: { rootId: "project", relativePath: "safe/config.toml" } }],
    } as unknown as ReportV1;

    const output = renderTerminal(report);
    expect(output).not.toContain("\u001b");
    expect(output).toContain("evil�[31m�spoof");
    expect(output).toContain("bad�[2J�message");
  });
});
