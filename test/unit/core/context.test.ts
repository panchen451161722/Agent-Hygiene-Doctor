import { describe, expect, it } from "vitest";
import { createScanContext, ALLOWLISTED_ENVIRONMENT_KEYS } from "../../../src/core/context.js";
import { posixDialect } from "../../../src/core/path-dialect.js";

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
});
