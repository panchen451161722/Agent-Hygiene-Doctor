import { describe, expect, it } from "vitest";

import type { ReportV1 } from "../../src/core/report.js";
import { renderTerminal } from "../../src/reporters/terminal.js";

describe("terminal reporter safety", () => {
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