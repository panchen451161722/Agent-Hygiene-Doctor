import { describe, expect, it } from "vitest";
import { hasClaudeProjectMcpApproval } from "../../../src/adapters/claude/approval.js";
import { hermesMcpDependsOnEnvironment } from "../../../src/adapters/hermes/activation.js";

describe("MCP activation boundaries", () => {
  it("accepts only the closed Claude per-project trust boolean", () => {
    expect(hasClaudeProjectMcpApproval({ projects: { "/repo": { hasTrustDialogAccepted: true, token: "secret" } } }, "/repo")).toBe(true);
    expect(hasClaudeProjectMcpApproval({ projects: { "/repo": { approved: true } } }, "/repo")).toBe(false);
    expect(hasClaudeProjectMcpApproval({ projects: { "/other": { hasTrustDialogAccepted: true } } }, "/repo")).toBe(false);
  });

  it("detects Hermes MCP environment references without reading their values", () => {
    expect(hermesMcpDependsOnEnvironment({ mcp_servers: { local: { command: "node", args: ["${MCP_HOME}/server.js"] } } }, "local")).toBe(true);
    expect(hermesMcpDependsOnEnvironment({ mcp_servers: { fixed: { command: "node", args: ["server.js"] } } }, "fixed")).toBe(false);
  });
});