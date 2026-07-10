import { Command, CommanderError, Option } from "commander";

export const CLI_ERROR_CODES = {
  invalidAgent: "AH-CLI-INVALID-AGENT",
  invalidArgument: "AH-CLI-INVALID-ARGUMENT",
} as const;

export type CliErrorCode =
  (typeof CLI_ERROR_CODES)[keyof typeof CLI_ERROR_CODES];

export class CliError extends Error {
  readonly code: CliErrorCode;

  constructor(code: CliErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "CliError";
    this.code = code;
  }
}

export type Agent = "codex" | "claude" | "hermes";
export type OutputFormat = "terminal" | "json";
export type FailureLevel = "error" | "warning";

interface SharedCliOptions {
  agents: Agent[];
  project?: string;
  format: OutputFormat;
  interactive: boolean;
  color: boolean;
  failOn: FailureLevel;
  verbose: boolean;
  dryRun: boolean;
  yes: boolean;
  force: boolean;
  uninstall: boolean;
}

export type CliOptions =
  | ({ command: "doctor" } & SharedCliOptions)
  | ({ command: "setup" } & SharedCliOptions);

interface RawCliOptions {
  agent: Agent[];
  project?: string;
  format: OutputFormat;
  agentMode: boolean;
  failOn: FailureLevel;
  verbose: boolean;
  dryRun: boolean;
  yes: boolean;
  force: boolean;
  uninstall: boolean;
}

const SUPPORTED_AGENTS: readonly Agent[] = ["codex", "claude", "hermes"];

function collectAgent(value: string, previous: Agent[]): Agent[] {
  if (!SUPPORTED_AGENTS.includes(value as Agent)) {
    throw new CliError(
      CLI_ERROR_CODES.invalidAgent,
      `Unsupported agent "${value}"`,
    );
  }

  return [...previous, value as Agent];
}

function configureCommand(command: Command): Command {
  return command
    .addOption(
      new Option("--agent <agent>", "agent to inspect")
        .argParser(collectAgent)
        .default([]),
    )
    .option("--project <path>", "project directory")
    .addOption(
      new Option("--format <format>", "output format")
        .choices(["terminal", "json"])
        .default("terminal"),
    )
    .option("--agent-mode", "use machine-readable non-interactive output")
    .addOption(
      new Option("--fail-on <level>", "failure threshold")
        .choices(["error", "warning"])
        .default("error"),
    )
    .option("--verbose", "enable verbose output")
    .option("--dry-run", "show actions without applying them")
    .option("--yes", "accept prompts")
    .option("--force", "force the requested operation")
    .option("--uninstall", "remove an existing setup");
}

function normalizeOptions(
  command: "doctor" | "setup",
  raw: RawCliOptions,
): CliOptions {
  const format = raw.agentMode ? "json" : raw.format;

  return {
    command,
    agents: raw.agent,
    ...(raw.project === undefined ? {} : { project: raw.project }),
    format,
    interactive: !raw.agentMode,
    color: !raw.agentMode,
    failOn: raw.failOn,
    verbose: raw.verbose,
    dryRun: raw.dryRun,
    yes: raw.yes,
    force: raw.force,
    uninstall: raw.uninstall,
  };
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const program = new Command()
    .name("agent-hygiene")
    .exitOverride()
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
    });

  let parsed: CliOptions | undefined;

  for (const commandName of ["doctor", "setup"] as const) {
    configureCommand(program.command(commandName)).action(
      (raw: RawCliOptions) => {
        parsed = normalizeOptions(commandName, raw);
      },
    );
  }

  try {
    program.parse(["node", "agent-hygiene", ...argv]);
  } catch (error: unknown) {
    if (error instanceof CliError) {
      throw error;
    }
    if (error instanceof CommanderError) {
      throw new CliError(CLI_ERROR_CODES.invalidArgument, error.message);
    }
    throw error;
  }

  if (parsed === undefined) {
    throw new CliError(
      CLI_ERROR_CODES.invalidArgument,
      "A command is required",
    );
  }

  return parsed;
}
