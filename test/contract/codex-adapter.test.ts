import { describe, expect, it } from "vitest";
import { projectCodexConfig } from "../../src/adapters/codex/config.js";
import { projectCodexMcp } from "../../src/adapters/codex/mcp.js";
import { selectCodexInstructions } from "../../src/adapters/codex/instructions.js";

describe("Codex adapter projections", () => {
  it("clamps project document bytes and sorts markers", () => {
    expect(projectCodexConfig({ project_doc_max_bytes: 999999, project_root_markers: ["z", "a"], trust: "trusted" })).toEqual({ projectRootMarkers: ["a", "z"], projectDocMaxBytes: 32768, trust: "trusted" });
  });
  it("projects safe MCP candidates from a Codex config", () => {
    expect(projectCodexMcp({ mcp_servers: { github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github@1.2.3"], env: { GITHUB_TOKEN: "secret" } }, remote: { url: "https://mcp.example.test/api", headers: { Authorization: "Bearer secret" } } } })).toMatchObject([
      { name: "github", status: "active", input: { transport: "stdio", command: "npx" } },
      { name: "remote", status: "active", input: { transport: "http", url: "https://mcp.example.test/api" } },
    ]);
  });
  it("keeps disabled and malformed MCP servers visible", () => {
    expect(projectCodexMcp({ mcp_servers: { disabled: { command: "node", enabled: false }, malformed: { args: ["missing-command"] } } })).toMatchObject([
      { name: "disabled", status: "disabled" },
      { name: "malformed", status: "unresolved" },
    ]);
  });
  it("gives override instructions precedence", () => {
    expect(selectCodexInstructions([{ path: "AGENTS.md", kind: "standard", active: true }, { path: "AGENTS.override.md", kind: "override", active: true }]).map((entry) => entry.path)).toEqual(["AGENTS.override.md", "AGENTS.md"]);
  });
});
