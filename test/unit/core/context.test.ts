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
      toolVersion: "0.1.0",
      clock: { now: () => "2026-07-11T00:00:00.000Z" },
    });
    expect(context.userHome).toBe("/home/alice");
    expect(context.environment).toEqual({ HOME: "/home/alice", PATH: "/bin" });
    expect(Object.keys(context.environment)).toEqual(expect.arrayContaining([...ALLOWLISTED_ENVIRONMENT_KEYS]));
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.environment)).toBe(true);
  });

  it("rejects Windows relative and root-relative working directories", async () => {
    const base = { platform: "win32" as const, paths: win32Dialect, environment: { USERPROFILE: "C:\\Users\\alice" }, fs: { lstat: async () => null }, toolVersion: "0.1.0" };
    await expect(createScanContext({ ...base, selectedWorkingDirectory: "relative" })).rejects.toThrow();
    await expect(createScanContext({ ...base, selectedWorkingDirectory: "\\workspace" })).rejects.toThrow();
  });

  it("keeps injected filesystem objects mutable", async () => {
    const backend = { calls: 0, lstat: async () => null };
    await createScanContext({ platform: "linux", paths: posixDialect, selectedWorkingDirectory: "/repo", environment: { HOME: "/home/alice" }, fs: backend, toolVersion: "0.1.0" });
    backend.calls++;
    expect(backend.calls).toBe(1);
  });
});
