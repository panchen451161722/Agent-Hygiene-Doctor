import { describe, expect, it } from "vitest";
import { normalizeName, normalizeText, normalizedContentFingerprint } from "../../../src/rules/normalization.js";

describe("normalization", () => {
  it("normalizes BOM, line endings, NFC, trailing whitespace, and blank lines", () => {
    expect(normalizeText("\uFEFF\r\n  Cafe\u0301  \rnext\t\r\n\r\n")).toBe("  Café\nnext");
  });

  it("folds only ASCII letters in canonical names", () => {
    expect(normalizeName("  ÄBC-XyZ  ")).toBe("Äbc-xyz");
  });

  it("hashes normalized UTF-8 bytes", () => {
    expect(normalizedContentFingerprint("a\r\n")).toBe(normalizedContentFingerprint("a"));
  });
});
