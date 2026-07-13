import { describe, expect, it } from "vitest";
import { createScanContext, ALLOWLISTED_ENVIRONMENT_KEYS } from "../../../src/core/context.js";
import { posixDialect, win32Dialect } from "../../../src/core/path-dialect.js";

describe("createScanContext", () => {
  it("snapshots only documented environment values and freezes the context", async () => {
    const context = await createScanContext({
      platform: "linux",
      paths: posixDialect,
      selectedWorkingDirectory: "/repo",
      environment: { HOME: "/home/alice", PATH: "/bin", SECRET_TOKEN: "do-not-copy" },
      fs: { lstat: async () => null },
      toolVersion: "1.1.0",
      clock: { now: () => "2026-07-11T00:00:00.000Z" },
    });
    expect(context.userHome).toBe("/home/alice");
    expect(context.environment).toEqual({ HOME: "/home/alice", PATH: "/bin" });
    expect(Object.keys(context.environment)).toEqual(expect.arrayContaining([...ALLOWLISTED_ENVIRONMENT_KEYS]));
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.environment)).toBe(true);
  });

  it("uses the documented native Windows Hermes home when no override is set", async () => {
    const context = await createScanContext({ platform: "win32", paths: win32Dialect, selectedWorkingDirectory: "C:\\repo", projectRoot: "C:\\repo", environment: { USERPROFILE: "C:\\Users\\alice" }, fs: { lstat: async () => null }, toolVersion: "1.1.0" });
    expect(context.roots.getAbsolutePathForScan("hermes-home")).toBe("C:\\Users\\alice\\AppData\\Local\\hermes");
  });
  it("rejects Windows relative and root-relative working directories", async () => {
    const base = { platform: "win32" as const, paths: win32Dialect, environment: { USERPROFILE: "C:\\Users\\alice" }, fs: { lstat: async () => null }, toolVersion: "1.1.0" };
    await expect(createScanContext({ ...base, selectedWorkingDirectory: "relative" })).rejects.toThrow();
    await expect(createScanContext({ ...base, selectedWorkingDirectory: "\\workspace" })).rejects.toThrow();
  });

  it("keeps injected filesystem objects mutable", async () => {
    const backend = { calls: 0, lstat: async () => null };
    await createScanContext({ platform: "linux", paths: posixDialect, selectedWorkingDirectory: "/repo", environment: { HOME: "/home/alice" }, fs: backend, toolVersion: "1.1.0" });
    backend.calls++;
    expect(backend.calls).toBe(1);
  });

  it("rejects a dialect that does not match the declared platform", async () => {
    await expect(createScanContext({ platform: "win32", paths: posixDialect, selectedWorkingDirectory: "/repo", environment: { USERPROFILE: "/home/alice" }, fs: { lstat: async () => null }, toolVersion: "1.1.0" })).rejects.toThrow();
  });

  it("requires an explicit project root to contain the selected directory", async () => {
    const base = { platform: "linux" as const, paths: posixDialect, selectedWorkingDirectory: "/repo/sub", environment: { HOME: "/home/alice" }, fs: { lstat: async () => null }, toolVersion: "1.1.0" };
    await expect(createScanContext({ ...base, projectRoot: "/other" })).rejects.toThrow();
    const context = await createScanContext({ ...base, projectRoot: "/repo" });
    expect(context.genericProjectRoot).toBe("/repo");
  });

  it("creates one shared SafeFileSystem when a backend is injected", async () => {
    const backend = { lstat: async () => ({ type: "directory" as const, size: 0 }), realpath: async (path: string) => path, readDirectory: async () => [], openRegularFile: async () => ({ stat: async () => ({ type: "file" as const, size: 0 }), read: async () => new Uint8Array(), close: async () => undefined }) };
    const context = await createScanContext({ platform: "linux", paths: posixDialect, selectedWorkingDirectory: "/repo", projectRoot: "/repo", environment: { HOME: "/home/alice" }, fs: { lstat: async () => "directory" as const }, backend, toolVersion: "1.1.0" });
    expect(context.safeFs).toBeDefined();
    expect(context.safeFs?.semaphore).toBe(context.ioSemaphore);
    expect(context.roots.descriptors().map((root) => root.id)).toEqual(expect.arrayContaining(["codex-home", "claude-home", "hermes-home"]));
  });
});