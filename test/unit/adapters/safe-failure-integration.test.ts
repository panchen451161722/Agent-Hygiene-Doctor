import { describe, expect, it } from "vitest";
import { adapter as codex } from "../../../src/adapters/codex/adapter.js";
import { adapter as claude } from "../../../src/adapters/claude/adapter.js";

const contextFor = (path: string) => {
  const root = {} as never;
  return {
    genericProjectRoot: "/repo",
    safeFs: {
      admitRoot: async () => ({ ok: true as const, root }),
      readText: async (_root: unknown, relativePath: string) => relativePath === path
        ? { ok: false as const, diagnostic: { code: "special_file" as const } }
        : { ok: false as const, diagnostic: { code: "not_found" as const } },
      readDirectory: async () => ({ ok: false as const, diagnostic: { code: "not_found" as const } }),
    },
  } as never;
};

describe("adapter safe filesystem diagnostics", () => {
  it("reports Codex configuration safety failures without a physical path", async () => {
    const result = await codex.scan(contextFor(".codex/config.toml"));
    expect(result).toMatchObject({ coverage: "partial", diagnostics: [{ code: "unsafe_reference", source: { rootId: "project", relativePath: ".codex/config.toml" } }] });
    expect(JSON.stringify(result)).not.toContain("/repo");
  });

  it("reports Claude project MCP safety failures without treating a missing file as an error", async () => {
    const result = await claude.scan(contextFor(".mcp.json"));
    expect(result).toMatchObject({ coverage: "partial", diagnostics: [{ code: "unsafe_reference", source: { rootId: "project", relativePath: ".mcp.json" } }] });
    expect(result.diagnostics).toHaveLength(1);
  });
});