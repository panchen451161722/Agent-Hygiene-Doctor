import { describe, expect, it } from "vitest";
import type { ScanContext } from "../../../src/core/context.js";
import { resolveMcpCommands } from "../../../src/adapters/shared/command-resolution.js";

const context = {
  platform: "linux",
  selectedWorkingDirectory: "/repo",
  environment: { PATH: "/bin", PATHEXT: undefined },
  safeFs: { resolveExecutableMetadata: async () => "not-found" as const },
} as unknown as ScanContext;

describe("resolveMcpCommands", () => {
  it("adds metadata-only command status to active stdio MCP definitions", async () => {
    const result = await resolveMcpCommands(context, [
      { name: "missing", status: "active", input: { name: "missing", transport: "stdio", command: "missing-tool", args: [] } },
      { name: "remote", status: "active", input: { name: "remote", transport: "http", url: "https://mcp.example.test" } },
      { name: "disabled", status: "disabled", input: { name: "disabled", transport: "stdio", command: "disabled-tool", args: [] } },
    ]);
    expect(result).toMatchObject([
      { input: { commandResolution: "not-found" } },
      { input: { transport: "http" } },
      { input: { command: "disabled-tool" } },
    ]);
  });
});