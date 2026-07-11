import { describe, expect, it } from "vitest";
import { projectClaudeSettings } from "../../src/adapters/claude/settings.js";
import { selectClaudeImports } from "../../src/adapters/claude/instructions.js";
import { projectClaudePlugin } from "../../src/adapters/claude/plugins.js";

describe("Claude adapter projections", () => {
  it("sorts managed settings before user settings and marks unreadable sources unresolved", () => {
    expect(projectClaudeSettings([{ name: "user" }, { name: "managed", managed: true, mcp: true }, { name: "local", readable: false }])).toEqual({ precedence: ["managed", "local", "user"], managed: true, mcpEnabled: true, unresolved: true });
  });
  it("limits imports to approved five-hop sources", () => {
    expect(selectClaudeImports([{ path: "a", depth: 1, approved: true }, { path: "b", depth: 6, approved: true }, { path: "c", depth: 2, approved: false }])).toEqual([{ path: "a", depth: 1, approved: true }]);
  });
  it("excludes plugin data from projected components", () => {
    expect(projectClaudePlugin({ name: "p", installed: true, components: ["hooks", "data", "skills"] })).toEqual({ name: "p", activation: "active", components: ["hooks", "skills"] });
  });
});
