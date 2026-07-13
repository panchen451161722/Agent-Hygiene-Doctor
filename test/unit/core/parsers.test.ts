import { describe, expect, it } from "vitest";

import { parseJson, parseJsonc } from "../../../src/core/parsers/json.js";
import { parseToml } from "../../../src/core/parsers/toml.js";
import { parseYaml } from "../../../src/core/parsers/yaml.js";

const source = { rootId: "project", relativePath: "config.json" } as const;

describe("sanitized bounded parsers", () => {
  it("parses valid JSON and strips an optional BOM", () => {
    expect(parseJson("\uFEFF{\"enabled\":true}", { source })).toEqual({ ok: true, value: { enabled: true } });
  });

  it("parses bounded JSONC without exposing invalid input", () => {
    expect(parseJsonc('{ // comment\n  "enabled": true,\n}', { source })).toEqual({ ok: true, value: { enabled: true } });
    const result = parseJsonc("{ // seeded-super-secret", { source });
    expect(JSON.stringify(result)).not.toContain("seeded-super-secret");
    expect(result).toMatchObject({ ok: false, diagnostic: { code: "parse_error", source } });
  });

  it("does not expose malformed JSON secrets", () => {
    const result = parseJson('{"token":"seeded-super-secret",', { source });
    expect(JSON.stringify(result)).not.toContain("seeded-super-secret");
    expect(result).toMatchObject({ ok: false, diagnostic: { code: "parse_error", source } });
  });

  it("rejects invalid UTF-8 and oversized input", () => {
    expect(parseJson(new Uint8Array([0xff, 0xfe]), { source })).toMatchObject({ ok: false, diagnostic: { code: "parse_error" } });
    expect(parseJson("{}", { source, limits: { maxBytes: 1 } })).toMatchObject({ ok: false, diagnostic: { code: "limit_exceeded" } });
  });

  it("enforces JSON node and depth limits", () => {
    expect(parseJson("{\"a\":{\"b\":1}}", { source, limits: { maxDepth: 1 } })).toMatchObject({ ok: false, diagnostic: { code: "limit_exceeded" } });
    expect(parseJson("[1,2,3]", { source, limits: { maxNodes: 2 } })).toMatchObject({ ok: false, diagnostic: { code: "limit_exceeded" } });
  });

  it("never raises parser safety limits above defaults", () => {
    expect(parseJson("{}", { source, limits: { maxBytes: Number.MAX_SAFE_INTEGER } })).toMatchObject({ ok: true });
  });

  it("parses TOML without leaking parser errors", () => {
    expect(parseToml("enabled = true\n", { source })).toEqual({ ok: true, value: { enabled: true } });
    const result = parseToml('token = "seeded-super-secret\n', { source });
    expect(JSON.stringify(result)).not.toContain("seeded-super-secret");
    expect(result).toMatchObject({ ok: false, diagnostic: { code: "parse_error" } });
  });

  it("bounds YAML aliases before converting to JavaScript", () => {
    const yaml = "base: &base\n  token: seeded-super-secret\ncopy: *base\n";
    const result = parseYaml(yaml, { source, limits: { maxYamlAliases: 0 } });
    expect(result).toMatchObject({ ok: false, diagnostic: { code: "limit_exceeded" } });
    expect(JSON.stringify(result)).not.toContain("seeded-super-secret");
  });
});