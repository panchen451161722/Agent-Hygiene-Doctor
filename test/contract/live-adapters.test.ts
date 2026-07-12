import { describe, expect, it } from "vitest";
import { adapter as codex } from "../../src/adapters/codex/adapter.js";
import { adapter as claude } from "../../src/adapters/claude/adapter.js";
import { adapter as hermes } from "../../src/adapters/hermes/adapter.js";

const context = (files: Record<string, string>) => { const root = {} as never; const safeFs = { admitRoot: async () => ({ ok: true as const, root }), readText: async (_root: unknown, path: string) => files[path] === undefined ? { ok: false as const, diagnostic: { code: "not_found" as const } } : { ok: true as const, text: files[path] } }; return { safeFs } as never; };

describe("live adapter file projections", () => {
  it("projects Codex project instructions", async () => { const result = await codex.scan(context({ "AGENTS.md": "rules" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("codex"); });
  it("projects Codex TOML configuration", async () => { const result = await codex.scan(context({ "config.toml": "profile = \"default\"" })); expect(result.inventory.some((entry) => entry.kind === "configuration")).toBe(true); });
  it("projects Claude project instructions", async () => { const result = await claude.scan(context({ "CLAUDE.md": "rules" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("claude"); });
  it("projects Hermes SOUL instructions", async () => { const result = await hermes.scan(context({ "SOUL.md": "soul" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("hermes"); });
});

