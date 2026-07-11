import { describe, expect, it } from "vitest";
import { estimateTokens } from "../../../src/rules/token-estimate.js";

describe("token estimate", () => {
  it("uses Unicode code points and ceil(length / 4)", () => {
    expect(estimateTokens("😀😀😀😀😀")).toBe(2);
  });
});
