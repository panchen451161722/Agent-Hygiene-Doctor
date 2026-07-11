import { describe, expect, it } from "vitest";
import { findGenericProjectRoot } from "../../../src/core/project-root.js";
import { posixDialect } from "../../../src/core/path-dialect.js";

describe("findGenericProjectRoot", () => {
  it("selects the nearest ancestor containing a .git file or directory", async () => {
    const entries = new Map<string, "file" | "directory">([
      ["/repo/.git", "directory"],
    ]);
    const fs = { lstat: async (path: string) => entries.get(path) ?? null };
    await expect(findGenericProjectRoot("/repo/packages/app", posixDialect, fs)).resolves.toBe("/repo");
  });

  it("falls back to the selected directory when no marker exists", async () => {
    const fs = { lstat: async () => null };
    await expect(findGenericProjectRoot("/repo/packages/app", posixDialect, fs)).resolves.toBe("/repo/packages/app");
  });

  it("accepts a .git regular file marker", async () => {
    const fs = { lstat: async (path: string) => path === "/repo/.git" ? "file" : null };
    await expect(findGenericProjectRoot("/repo/sub", posixDialect, fs)).resolves.toBe("/repo");
  });
});
