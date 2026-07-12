import { describe, expect, it } from "vitest";
import { adapter as codex } from "../../src/adapters/codex/adapter.js";
import { adapter as claude } from "../../src/adapters/claude/adapter.js";
import { adapter as hermes } from "../../src/adapters/hermes/adapter.js";
import { posixDialect } from "../../src/core/path-dialect.js";

const context = (files: Record<string, string>) => ({ paths: posixDialect, genericProjectRoot: "/repo", userHome: "/home/a", environment: { HOME: "/home/a", HERMES_HOME: "/hermes" }, fs: { readFile: async (path: string) => { const value = files[path]; if (value === undefined) throw new Error("ENOENT"); return value; }, lstat: async () => null }, } as never);

describe("live adapter file projections", () => {
  it("projects Codex project instructions", async () => { const result = await codex.scan(context({ "/repo/AGENTS.md": "rules" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("codex"); });
  it("projects Claude project instructions", async () => { const result = await claude.scan(context({ "/repo/CLAUDE.md": "rules" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("claude"); });
  it("projects Hermes SOUL instructions", async () => { const result = await hermes.scan(context({ "/hermes/SOUL.md": "soul" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("hermes"); });
});
