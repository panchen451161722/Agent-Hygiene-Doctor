import { describe, expect, it } from "vitest";
import { parseCliOptions } from "../../../src/cli/options.js";

describe("parseCliOptions", () => {
  it("returns exact doctor defaults with concrete booleans", () => {
    expect(parseCliOptions(["doctor"])).toEqual({
      command: "doctor",
      agents: [],
      format: "terminal",
      agentMode: false,
      interactive: true,
      color: true,
      failOn: "error",
      verbose: false,
    });
  });

  it("rejects an unsupported agent", () => {
    expect(() => parseCliOptions(["doctor", "--agent", "cursor"]))
      .toThrowError("AH-CLI-INVALID-AGENT");
  });

  it("returns exact setup defaults with concrete booleans", () => {
    expect(parseCliOptions(["setup"])).toEqual({
      command: "setup",
      agents: [],
      dryRun: false,
      yes: false,
      force: false,
      uninstall: false,
    });
  });

  it.each([
    {
      name: "doctor flags",
      argv: [
        "doctor", "--agent", "codex", "--agent", "claude",
        "--project", "./fixture", "--format", "json",
        "--fail-on", "warning", "--verbose",
      ],
      expected: {
        command: "doctor",
        agents: ["codex", "claude"],
        project: "./fixture",
        format: "json",
        agentMode: false,
        interactive: true,
        color: true,
        failOn: "warning",
        verbose: true,
      },
    },
    {
      name: "doctor agent mode",
      argv: ["doctor", "--agent", "hermes", "--agent-mode"],
      expected: {
        command: "doctor",
        agents: ["hermes"],
        format: "json",
        agentMode: true,
        interactive: false,
        color: false,
        failOn: "error",
        verbose: false,
      },
    },
    {
      name: "setup flags",
      argv: [
        "setup", "--agent", "codex", "--agent", "hermes",
        "--dry-run", "--yes", "--force", "--uninstall",
      ],
      expected: {
        command: "setup",
        agents: ["codex", "hermes"],
        dryRun: true,
        yes: true,
        force: true,
        uninstall: true,
      },
    },
  ])("parses $name", ({ argv, expected }) => {
    expect(parseCliOptions(argv)).toEqual(expected);
  });

  it.each([
    ["invalid format", ["doctor", "--format", "xml"]],
    ["invalid failure level", ["doctor", "--fail-on", "info"]],
    ["missing command", []],
  ])("rejects %s", (_name, argv) => {
    expect(() => parseCliOptions(argv)).toThrowError(
      "AH-CLI-INVALID-ARGUMENT",
    );
  });

  it.each([
    ["--dry-run", "doctor", undefined],
    ["--yes", "doctor", undefined],
    ["--force", "doctor", undefined],
    ["--uninstall", "doctor", undefined],
    ["--project", "setup", "./fixture"],
    ["--format", "setup", "json"],
    ["--agent-mode", "setup", undefined],
    ["--fail-on", "setup", "warning"],
    ["--verbose", "setup", undefined],
  ])("rejects cross-command flag %s on %s", (flag, command, value) => {
    const argv = value === undefined ? [command, flag] : [command, flag, value];

    expect(() => parseCliOptions(argv)).toThrowError(
      "AH-CLI-INVALID-ARGUMENT",
    );
  });

  it("returns successful help output", () => {
    const result = parseCliOptions(["--help"]) as unknown as {
      kind: string;
      exitCode: number;
      output: string;
    };

    expect(result.kind).toBe("display");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Usage: agent-hygiene");
  });
});
