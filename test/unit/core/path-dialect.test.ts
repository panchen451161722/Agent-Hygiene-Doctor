import { describe, expect, it, vi } from "vitest";
import { posixDialect, win32Dialect } from "../../../src/core/path-dialect.js";

describe("PathDialect", () => {
  it("rejects a Windows sibling prefix", () => {
    expect(win32Dialect.contains("C:\\agent", "C:\\agent-old\\x")).toBe(false);
  });

  it("rejects alternate data streams in non-drive segments", () => {
    expect(() => win32Dialect.assertSafe("C:\\agent\\x:stream")).toThrow();
    expect(win32Dialect.contains("C:\\agent", "C:\\agent\\x:stream")).toBe(false);
  });

  it("accepts POSIX names beginning with two dots when contained", () => {
    expect(posixDialect.contains("/agent", "/agent/..foo/config")).toBe(true);
    expect(() => posixDialect.relative("/agent", "/agent/..foo/config")).not.toThrow();
    expect(posixDialect.contains("/agent", "/agent/../escape")).toBe(false);
    expect(() => posixDialect.relative("/agent", "/escape")).toThrow();
  });

  it("accepts Windows names beginning with two dots when contained", () => {
    expect(win32Dialect.contains("C:\\agent", "C:\\agent\\..foo\\config")).toBe(true);
    expect(() => win32Dialect.relative("C:\\agent", "C:\\agent\\..foo\\config")).not.toThrow();
    expect(win32Dialect.contains("C:\\agent", "C:\\agent\\..\\escape")).toBe(false);
    expect(() => win32Dialect.relative("C:\\agent", "C:\\escape")).toThrow();
  });

  it("rejects relative resolve inputs", () => {
    expect(() => posixDialect.resolve("relative")).toThrow();
    expect(() => win32Dialect.resolve("/agent", "nested")).toThrow();
    expect(() => win32Dialect.resolve("C:\\agent", "nested")).toThrow();
    expect(() => win32Dialect.resolve("C:\\agent", "D:escape")).toThrow();
  });

  it("resolves fully-qualified absolute inputs deterministically", () => {
    expect(posixDialect.resolve("/agent", "/agent/file")).toBe("/agent/file");
    expect(win32Dialect.resolve("C:\\agent", "C:\\agent\\file")).toBe("C:\\agent\\file");
  });

  it("validates resolve inputs before consulting host cwd", () => {
    const cwd = vi.spyOn(process, "cwd").mockImplementation(() => { throw new Error("CWD_TOUCHED"); });
    try {
      expect(() => posixDialect.resolve("relative")).toThrow(/absolute paths are required/);
    } finally {
      cwd.mockRestore();
    }
  });
});
