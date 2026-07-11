import { describe, expect, it } from "vitest";
import { runSetup } from "../../../src/cli/setup.js";

describe("setup confirmation boundary", () => {
  const options = { command: "setup" as const, agents: [], dryRun: false, yes: false, force: false, uninstall: false };
  it("refuses writes without --yes", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(runSetup(options, { writeStdout: (text) => stdout.push(text), writeStderr: (text) => stderr.push(text) })).toBe(2);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("--yes");
  });
  it("supports dry-run without confirmation", () => {
    const output: string[] = [];
    expect(runSetup({ ...options, dryRun: true }, { writeStdout: (text) => output.push(text), writeStderr: () => undefined })).toBe(0);
    expect(output.join(" ")).toContain("dry-run");
  });
});
