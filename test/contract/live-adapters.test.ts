import { describe, expect, it } from "vitest";
import { adapter as codex } from "../../src/adapters/codex/adapter.js";
import { adapter as claude } from "../../src/adapters/claude/adapter.js";
import { adapter as hermes } from "../../src/adapters/hermes/adapter.js";

const context = (files: Record<string, string>, directories: Record<string, readonly string[]> = {}) => { const root = {} as never; const safeFs = { admitRoot: async () => ({ ok: true as const, root }), readText: async (_root: unknown, path: string) => files[path] === undefined ? { ok: false as const, diagnostic: { code: "not_found" as const } } : { ok: true as const, text: files[path] }, readDirectory: async (_root: unknown, path: string) => directories[path] === undefined ? { ok: false as const, diagnostic: { code: "not_found" as const } } : { ok: true as const, entries: directories[path] } }; return { safeFs } as never; };

describe("live adapter file projections", () => {
  it("marks partial coverage when Codex finds only a supported surface", async () => { const result = await codex.scan(context({ "AGENTS.md": "rules" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("codex"); expect(result.coverage).toBe("partial"); });
  it("projects Codex TOML configuration", async () => { const result = await codex.scan(context({ "config.toml": "profile = \"default\"" })); expect(result.inventory.some((entry) => entry.kind === "configuration")).toBe(true); });
  it("projects Codex user skills from admitted directory entries", async () => { const result = await codex.scan(context({ ".agents/skills/demo/SKILL.md": "skill" }, { ".agents/skills": ["demo"] })); expect(result.inventory).toMatchObject([{ facts: { type: "skill", effectiveName: "demo" } }]); });
  it("marks partial coverage when Claude finds only a supported surface", async () => { const result = await claude.scan(context({ "CLAUDE.md": "rules" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("claude"); expect(result.coverage).toBe("partial"); });
  it("projects Claude JSON settings", async () => { const result = await claude.scan(context({ "settings.json": "{}" })); expect(result.inventory.some((entry) => entry.kind === "configuration")).toBe(true); });
  it("projects Claude user skills from admitted directory entries", async () => { const result = await claude.scan(context({ "skills/demo/SKILL.md": "skill" }, { "skills": ["demo"] })); expect(result.inventory).toMatchObject([{ facts: { type: "skill", effectiveName: "demo" } }]); });
  it("projects Hermes YAML configuration", async () => { const result = await hermes.scan(context({ "config.yaml": "enabled: true" })); expect(result.inventory.some((entry) => entry.kind === "configuration")).toBe(true); });
  it("marks partial coverage when Hermes finds only a supported surface", async () => { const result = await hermes.scan(context({ "SOUL.md": "soul" })); expect(result.inventory).toHaveLength(1); expect(result.inventory[0]?.agent).toBe("hermes"); expect(result.coverage).toBe("partial"); });
  it("projects Hermes user skills from admitted directory entries", async () => { const result = await hermes.scan(context({ "skills/demo/SKILL.md": "skill" }, { "skills": ["demo"] })); expect(result.inventory).toMatchObject([{ facts: { type: "skill", effectiveName: "demo" } }]); });
});
