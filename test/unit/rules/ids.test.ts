import { describe, expect, it } from "vitest";
import { stableId, stableSerialize } from "../../../src/rules/ids.js";

describe("stable ids", () => {
  it("does not depend on object insertion order", () => {
    expect(stableSerialize({ b: 2, a: 1 })).toBe(stableSerialize({ a: 1, b: 2 }));
    expect(stableId(["skill", { b: 2, a: 1 }])).toMatch(/^[0-9a-f]{64}$/u);
    expect(stableId(["skill", { b: 2, a: 1 }])).toBe(stableId(["skill", { a: 1, b: 2 }]));
  });
});
