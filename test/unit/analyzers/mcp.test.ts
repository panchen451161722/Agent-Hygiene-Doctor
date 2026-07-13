import { describe, expect, it } from "vitest";
import { analyzeMcp } from "../../../src/analyzers/mcp.js";
import { inspectMcp } from "../../../src/inspectors/mcp.js";

const context = { agent: "codex" as const, source: { rootId: "project", relativePath: ".codex/config.toml" }, scope: "project" as const, status: "active" as const, loading: "always" as const };

describe("MCP analyzer", () => {
  it("finds unpinned packages, plaintext remote endpoints, and credential fields", () => {
    const items = [
      inspectMcp({ name: "remote", transport: "http", url: "http://mcp.example.test", urlClass: "plaintext-remote", headerNames: ["Authorization"] }, context),
      inspectMcp({ name: "package", transport: "stdio", command: "npx", args: ["demo@latest"] }, context),
    ];
    expect(analyzeMcp(items).map((finding) => finding.ruleId)).toEqual(["mcp-credential-field", "mcp-package-unpinned", "mcp-plaintext-remote"]);
    expect(JSON.stringify(analyzeMcp(items))).not.toContain("secret");
    expect(analyzeMcp(items).every((finding) => finding.evidence[0]?.kind === "items")).toBe(true);
  });

  it("does not warn for disabled or exactly pinned MCP servers", () => {
    const disabled = inspectMcp({ name: "disabled", transport: "http", url: "http://mcp.example.test", urlClass: "plaintext-remote" }, { ...context, status: "disabled" as const });
    const pinned = inspectMcp({ name: "pinned", transport: "stdio", command: "npx", args: ["demo@1.2.3"] }, context);
    expect(analyzeMcp([disabled, pinned])).toEqual([]);
  });

  it("reports one stable finding for duplicate active MCP endpoint fingerprints", () => {
    const first = inspectMcp({ name: "first", transport: "http", url: "https://mcp.example.test" }, context);
    const second = inspectMcp({ name: "second", transport: "http", url: "https://mcp.example.test" }, { ...context, source: { rootId: "home", relativePath: ".claude.json" } });
    const disabled = inspectMcp({ name: "disabled", transport: "http", url: "https://mcp.example.test" }, { ...context, status: "disabled" as const, source: { rootId: "hermes-home", relativePath: "config.yaml" } });
    const duplicates = analyzeMcp([second, disabled, first]).filter((finding) => finding.ruleId === "mcp-duplicate-endpoint");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.evidence).toEqual([{ kind: "items", itemIds: [first.itemId, second.itemId].sort() }]);
  });
  it("reports unresolved transports without inferring command absence", () => {
    const unresolved = inspectMcp({ name: "unknown", transport: "stdio" }, { ...context, status: "unresolved" as const });
    expect(analyzeMcp([unresolved]).map((finding) => finding.ruleId)).toEqual(["mcp-transport-unknown"]);
  });
});