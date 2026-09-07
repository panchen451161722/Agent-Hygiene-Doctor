import { describe, expect, it } from "vitest";
import { RULE_CATALOG, getRule } from "../../../src/rules/catalog.js";
import { analyzeConfiguration } from "../../../src/analyzers/configuration.js";
import { inspectMcp } from "../../../src/inspectors/mcp.js";
import { item } from "../../../src/inspectors/common.js";

const context = { agent: "codex" as const, source: { rootId: "project", relativePath: ".codex/config.toml" }, scope: "project" as const, status: "unresolved" as const, loading: "always" as const };

describe("shared analysis catalog", () => {
  it("contains a rule for unresolved artifacts", () => {
    expect(getRule("unresolved-artifact")).toBeDefined();
    expect(RULE_CATALOG.map((rule) => rule.ruleId)).toEqual(["skill-metadata-invalid", "config-invalid", "duplicate-active", "mcp-credential-field", "mcp-package-unpinned", "mcp-plaintext-remote", "mcp-transport-unknown", "unresolved-artifact"]);
  });

  it("does not infer findings from complete inventory", () => {
    expect(analyzeConfiguration([])).toEqual([]);
  });

  it("does not analyze unresolved MCP items as configurations", () => {
    const mcp = inspectMcp({ name: "unknown", transport: "stdio" }, context);
    const configuration = item(context, "configuration", "config.toml", { type: "configuration", format: "toml", parseStatus: "invalid", precedence: 1 });
    expect(analyzeConfiguration([mcp])).toEqual([]);
    expect(analyzeConfiguration([configuration])).toHaveLength(1);
  });
});