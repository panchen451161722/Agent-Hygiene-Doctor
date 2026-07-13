import { describe, expect, it } from "vitest";

import { RemovalError } from "../../../src/manage/model.js";
import { removeMcpFromText } from "../../../src/manage/mcp-editor.js";

describe("MCP source editors", () => {
  it("removes one JSONC property without rewriting a neighbouring comment", () => {
    const input = '{\n  // retain this comment\n  "mcpServers": {\n    "keep": { "command": "keep" },\n    "drop": { "command": "drop" }\n  },\n  "other": true\n}\n';
    const output = removeMcpFromText(input, "json", "mcpServers", "drop");
    expect(output).toContain("// retain this comment");
    expect(output).toContain('"keep": { "command": "keep" }');
    expect(output).toContain('"other": true');
    expect(output).not.toContain('"drop"');
  });

  it("removes an exact YAML pair while retaining another server", () => {
    const input = "mcp_servers:\n  keep: # keep comment\n    command: keep\n  drop:\n    command: drop\nother: true\n";
    const output = removeMcpFromText(input, "yaml", "mcp_servers", "drop");
    expect(output).toContain("keep: # keep comment");
    expect(output).toContain("other: true");
    expect(output).not.toContain("drop:");
  });

  it("removes a TOML server table and its subtables", () => {
    const input = "# retain\n[mcp_servers.keep]\ncommand = 'keep'\n\n[mcp_servers.drop]\ncommand = 'drop'\n\n[mcp_servers.drop.extra]\nvalue = 1\n\n[other]\nvalue = true\n";
    const output = removeMcpFromText(input, "toml", "mcp_servers", "drop");
    expect(output).toContain("[mcp_servers.keep]");
    expect(output).toContain("[other]");
    expect(output).not.toContain("mcp_servers.drop");
  });

  it("refuses an unsupported TOML inline table", () => {
    expect(() => removeMcpFromText("mcp_servers = { drop = { command = 'x' } }\n", "toml", "mcp_servers", "drop")).toThrow(RemovalError);
  });
});
