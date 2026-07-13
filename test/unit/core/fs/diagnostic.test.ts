import { describe, expect, it } from "vitest";
import { safeFsDiagnostic } from "../../../../src/core/fs/diagnostic.js";

const source = { rootId: "project", relativePath: ".codex/config.toml" };

describe("safeFsDiagnostic", () => {
  it("keeps optional misses silent and maps unsafe bounded failures without raw details", () => {
    expect(safeFsDiagnostic("codex", source, { ok: false, diagnostic: { code: "not_found" } })).toBeUndefined();
    expect(safeFsDiagnostic("codex", source, { ok: false, diagnostic: { code: "limit_exceeded" } })).toMatchObject({ code: "limit_exceeded", coverageImpact: "partial", source });
    expect(safeFsDiagnostic("codex", source, { ok: false, diagnostic: { code: "special_file" } })).toMatchObject({ code: "unsafe_reference", coverageImpact: "partial", source });
  });
});