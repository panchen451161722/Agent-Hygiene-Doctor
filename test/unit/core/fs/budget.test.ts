import { describe, expect, it } from "vitest";
import { RootBudget } from "../../../../src/core/fs/budget.js";

describe("budgets", () => {
  it("exhausts independently and does not overspend", () => {
    const budget = new RootBudget({ files: 1, bytes: 3, depth: 1 });
    expect(budget.spend("files")).toBe(true); expect(budget.spend("files")).toBe(false);
    expect(budget.spend("bytes", 2)).toBe(true); expect(budget.spend("bytes", 2)).toBe(false);
    expect(budget.spend("bytes", 1)).toBe(false);
    expect(budget.check("depth", 1)).toBe(true);
    expect(budget.check("depth", 2)).toBe(false);
  });
});