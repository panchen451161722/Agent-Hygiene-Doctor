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

const CLI_ERROR_DETAILS: Record<CliErrorCode, string> = {
  "AH-CLI-INVALID-AGENT":
    "Unsupported agent. Expected codex, claude, or hermes.",
  "AH-CLI-INVALID-ARGUMENT": "Invalid command-line arguments.",
};

const MAX_CLI_ERROR_DETAIL_LENGTH = 120;

function sanitizeCatalogDetail(detail: string): string {
  return detail
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_CLI_ERROR_DETAIL_LENGTH);
}

export function formatCliError(error: CliError): string {
  const detail = sanitizeCatalogDetail(CLI_ERROR_DETAILS[error.code]);
  return `${error.code}: ${detail}`;
}

export type Agent = "codex" | "claude" | "hermes";
export type OutputFormat = "terminal" | "json";
export type FailureLevel = "error" | "warning";

export interface DoctorCliOptions {
  command: "doctor";
  agents: Agent[];
  project?: string;
  format: OutputFormat;
  agentMode: boolean;
  interactive: boolean;
  color: boolean;
  failOn: FailureLevel;
  verbose: boolean;
}

export interface SetupCliOptions {
  command: "setup";
  agents: Agent[];
  dryRun: boolean;
  yes: boolean;
  force: boolean;
  uninstall: boolean;
}

export type CliOptions = DoctorCliOptions | SetupCliOptions;

export interface CliDisplay {
  kind: "display";
  exitCode: 0;
  output: string;
}

export type CliParseResult = CliOptions | CliDisplay;

interface RawCommonOptions {
  agent?: Agent[];
}

interface RawDoctorOptions extends RawCommonOptions {
  project?: string;
  format: OutputFormat;
  agentMode?: boolean;
  failOn: FailureLevel;
  verbose?: boolean;
}

interface RawSetupOptions extends RawCommonOptions {
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
  uninstall?: boolean;
}

const SUPPORTED_AGENTS: readonly Agent[] = ["codex", "claude", "hermes"];

function collectAgent(value: string, previous: Agent[]): Agent[] {
  if (!SUPPORTED_AGENTS.includes(value as Agent)) {
    throw new CliError(CLI_ERROR_CODES.invalidAgent);
  }

  return [...previous, value as Agent];
}

function addAgentOption(command: Command): Command {
  return command.addOption(
    new Option("--agent <agent>", "agent to inspect")
      .argParser(collectAgent)
      .default([]),
  );
}

function configureDoctorCommand(command: Command): Command {
  return addAgentOption(command)
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
    .option("--verbose", "enable verbose output");
}

function configureSetupCommand(command: Command): Command {
  return addAgentOption(command)
    .option("--dry-run", "show actions without applying them")
    .option("--yes", "accept prompts")
    .option("--force", "force the requested operation")
    .option("--uninstall", "remove an existing setup");
}

function normalizeDoctorOptions(raw: RawDoctorOptions): DoctorCliOptions {
  const agentMode = raw.agentMode ?? false;
  const format = agentMode ? "json" : raw.format;

  return {
    command: "doctor",
    agents: raw.agent ?? [],
    ...(raw.project === undefined ? {} : { project: raw.project }),
    format,
    agentMode,
    interactive: !agentMode,
    color: !agentMode,
    failOn: raw.failOn,
    verbose: raw.verbose ?? false,
  };
}

function normalizeSetupOptions(raw: RawSetupOptions): SetupCliOptions {
  return {
    command: "setup",
    agents: raw.agent ?? [],
    dryRun: raw.dryRun ?? false,
    yes: raw.yes ?? false,
    force: raw.force ?? false,
    uninstall: raw.uninstall ?? false,
  };
}

export function parseCliOptions(argv: readonly string[]): CliParseResult {
  const output: string[] = [];
  const program = new Command()
    .name("agent-hygiene")
    .version("0.1.0")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => output.push(text),
      writeErr: (text) => output.push(text),
    });

  let parsed: CliOptions | undefined;

  configureDoctorCommand(program.command("doctor")).action(
    (raw: RawDoctorOptions) => {
      parsed = normalizeDoctorOptions(raw);
    },
  );
  configureSetupCommand(program.command("setup")).action(
    (raw: RawSetupOptions) => {
      parsed = normalizeSetupOptions(raw);
    },
  );

  try {
    program.parse(["node", "agent-hygiene", ...argv]);
  } catch (error: unknown) {
    if (error instanceof CliError) {
      throw error;
    }
    if (error instanceof CommanderError) {
      if (
        error.code === "commander.helpDisplayed" ||
        error.code === "commander.version"
      ) {
        return { kind: "display", exitCode: 0, output: output.join("") };
      }

      throw new CliError(CLI_ERROR_CODES.invalidArgument);
    }
    throw error;
  }

  if (parsed === undefined) {
    throw new CliError(CLI_ERROR_CODES.invalidArgument);
  }

  return parsed;
}
