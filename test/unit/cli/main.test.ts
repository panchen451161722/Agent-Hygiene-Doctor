import { afterEach, describe, expect, it } from "vitest";
import {
  runCli,
  type CliParser,
  type CliRuntime,
} from "../../../src/cli/main.js";

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
});

describe("CLI executable boundary", () => {
  it("is import-safe and exposes an injectable runner", async () => {
    process.argv = ["node", "agent-hygiene", "not-a-command"];
    process.exitCode = undefined;

    const mainModule = await import("../../../src/cli/main.js");

    expect(mainModule).toHaveProperty("runCli");
    expect(mainModule.runCli).toBeTypeOf("function");
    expect(process.exitCode).toBeUndefined();
  });

  it("writes cataloged errors to stderr and returns exit code 2", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime: CliRuntime = {
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    };

    expect(runCli(["doctor", "--agent", "cursor"], runtime)).toBe(2);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      "fatal: AH-CLI-INVALID-AGENT: Unsupported agent. Expected codex, claude, or hermes.\n",
    ]);
  });

  it("does not disclose hostile or credential-like argument values", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime: CliRuntime = {
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    };
    const secret = "token=super-secret";
    const hostileAgent = `${secret}\n\u001b[31m${"x".repeat(500)}`;

    expect(runCli(["doctor", "--agent", hostileAgent], runtime)).toBe(2);

    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
    const line = stderr[0] ?? "";
    expect(line.endsWith("\n")).toBe(true);
    expect(line.slice(0, -1)).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
    expect(line.length).toBeLessThanOrEqual(160);
    expect(line).not.toContain(secret);
    expect(line).not.toContain(hostileAgent);
    expect(line).not.toContain("\u001b");
  });

  it("rethrows unexpected failures", () => {
    const failure = new Error("unexpected");
    const parser: CliParser = () => {
      throw failure;
    };
    const runtime: CliRuntime = {
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    };

    expect(() => runCli(["doctor"], runtime, parser)).toThrow(failure);
  });

  it("writes help to stdout and exits successfully", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime: CliRuntime = {
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    };

    expect(runCli(["--help"], runtime)).toBe(0);
    expect(stdout.join("")).toContain("Usage: agent-hygiene");
    expect(stderr).toEqual([]);
  });
});
