import { describe, expect, it } from "vitest";
import { win32Dialect } from "../../../src/core/path-dialect.js";

describe("PathDialect", () => {
  it("rejects a Windows sibling prefix", () => {
    expect(win32Dialect.contains("C:\\agent", "C:\\agent-old\\x")).toBe(false);
  });
});
