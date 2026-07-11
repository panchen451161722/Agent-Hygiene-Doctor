import { describe, expect, it } from "vitest";
import { resolveExecutable } from "../../../src/rules/executable.js";

const fs = (entries: Record<string, { type: "file" | "directory"; mode?: number }>) => ({
  async lstat(path: string) {
    const entry = entries[path];
    if (entry === undefined) throw new Error("ENOENT");
    return entry.mode === undefined ? { type: entry.type, size: 0 } : { type: entry.type, size: 0, mode: entry.mode };
  },
});

describe("executable resolution", () => {
  it("checks POSIX executable bits", async () => {
    await expect(resolveExecutable("tool", { platform: "posix", cwd: "/work", path: "/bin", pathext: "", fs: fs({ "/bin/tool": { type: "file", mode: 0o755 } }) })).resolves.toMatchObject({ status: "resolved", path: "/bin/tool" });
    await expect(resolveExecutable("tool", { platform: "posix", cwd: "/work", path: "/bin", pathext: "", fs: fs({ "/bin/tool": { type: "file", mode: 0o644 } }) })).resolves.toMatchObject({ status: "not-found" });
  });

  it("matches Windows PATHEXT case-insensitively", async () => {
    await expect(resolveExecutable("Tool", { platform: "win32", cwd: "C:\\work", path: "C:\\bin", pathext: ".COM;.EXE", fs: fs({ "C:\\bin\\tool.EXE": { type: "file" } }) })).resolves.toMatchObject({ status: "resolved", path: "C:\\bin\\tool.EXE" });
  });

  it("returns unknown for empty PATH segments", async () => {
    await expect(resolveExecutable("tool", { platform: "posix", cwd: "/work", path: "/bin::/usr/bin", pathext: "", fs: fs({}) })).resolves.toMatchObject({ status: "unknown" });
  });
});
