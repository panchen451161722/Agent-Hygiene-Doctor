import { describe, expect, it } from "vitest";
import { RULE_CATALOG, getRule } from "../../../src/rules/catalog.js";
import { analyzeConfiguration } from "../../../src/analyzers/configuration.js";

describe("shared analysis catalog", () => {
  it("contains a rule for unresolved artifacts", () => {
    expect(getRule("unresolved-artifact")).toBeDefined();
    expect(RULE_CATALOG.map((rule) => rule.ruleId)).toEqual(["config-invalid", "duplicate-active", "mcp-credential-field", "mcp-package-unpinned", "mcp-plaintext-remote", "mcp-transport-unknown", "unresolved-artifact"]);
  });
  it("does not infer findings from complete inventory", () => {
    expect(analyzeConfiguration([])).toEqual([]);
  });
});
