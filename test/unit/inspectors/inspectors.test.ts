import { describe, expect, it } from "vitest";
import { inspectSkill } from "../../../src/inspectors/skill.js";
import { inspectInstruction } from "../../../src/inspectors/instruction.js";
import { inspectMcp } from "../../../src/inspectors/mcp.js";
import { inspectExtension } from "../../../src/inspectors/extension.js";
import { stableId } from "../../../src/rules/ids.js";

const context = { agent: "codex" as const, source: { rootId: "project", relativePath: "config.json" }, scope: "project" as const, status: "active" as const, loading: "always" as const };

describe("inventory inspectors", () => {
  it("projects a normalized skill without raw fields", () => {
    const item = inspectSkill({ frontmatter: "valid", name: " My Skill ", description: "Useful" }, context);
    expect(item).toMatchObject({ kind: "skill", name: "my skill", facts: { type: "skill", effectiveName: "my skill", nameUsable: true } });
    expect(JSON.stringify(item)).not.toContain("absolutePath");
  });

  it("fingerprints instruction content and estimates tokens", () => {
    const item = inspectInstruction({ text: "hello\r\nworld" }, context);
    expect(item.facts).toMatchObject({ type: "instruction", byteLength: 12, condition: "unknown" });
    expect(item.estimatedTokens).toBeGreaterThan(0);
  });

  it("retains only stdio MCP credential field names and package pins", () => {
    const item = inspectMcp({ name: "github", transport: "stdio", command: "npx", args: ["@modelcontextprotocol/server-github@1.2.3"], environmentNames: ["GITHUB_TOKEN"] }, context);
    expect(item.facts).toMatchObject({ type: "mcp", packageInvocation: "exact", credentialLikeFields: ["GITHUB_TOKEN"] });
    expect(JSON.stringify(item)).not.toContain("secret-value");
  });

  it("retains only HTTP MCP credential field names", () => {
    const item = inspectMcp({ name: "remote", transport: "http", url: "https://mcp.example.test/api?token=secret-value", headerNames: ["Authorization"], urlClass: "tls" }, context);
    expect(item.facts).toMatchObject({ type: "mcp", urlClass: "tls", credentialLikeFields: ["Authorization"] });
    expect(JSON.stringify(item)).not.toContain("secret-value");
  });

  it("produces stable extension IDs", () => {
    const item = inspectExtension({ extensionKind: "plugin", activation: "active", name: "plugin-a" }, context);
    expect(item.itemId).toBe(stableId(["codex", "plugin", "plugin-a", context.source]));
  });
});