#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  CliError,
  formatCliError,
  parseCliOptions,
} from "./options.js";
import { runDoctor, runDoctorAsync } from "./doctor.js";
import { runSetup, runSetupAsync } from "./setup.js";
import { runOperationsAsync, runRemoveAsync, runRestoreAsync } from "./manage.js";

export type CliParser = typeof parseCliOptions;

export interface CliRuntime {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
}

const processRuntime: CliRuntime = {
  writeStdout: (text) => process.stdout.write(text),
  writeStderr: (text) => process.stderr.write(text),
};

export function runCli(
  argv: readonly string[],
  runtime: CliRuntime = processRuntime,
  parse: CliParser = parseCliOptions,
): number {
  try {
    const result = parse(argv);

    if ("kind" in result) {
      runtime.writeStdout(result.output);
      return result.exitCode;
    }

    return result.command === "doctor" ? runDoctor(result, runtime) : runSetup(result, runtime);
  } catch (error: unknown) {
    if (!(error instanceof CliError)) {
      throw error;
    }

    runtime.writeStderr(`fatal: ${formatCliError(error)}\n`);
    return 2;
  }
}

const executablePath = process.argv[1];

if (
  executablePath !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(executablePath)).href
) {
  void runCliAsync(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}


export async function runCliAsync(argv: readonly string[], runtime: CliRuntime = processRuntime, parse: CliParser = parseCliOptions): Promise<number> {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    runtime.writeStdout("Usage: agent-hygiene <doctor|setup|remove|restore|operations> [options]\n");
    return 0;
  }
  if (argv[0] === "remove") return runRemoveAsync(argv.slice(1), runtime);
  if (argv[0] === "restore") return runRestoreAsync(argv.slice(1), runtime);
  if (argv[0] === "operations") return runOperationsAsync(argv.slice(1), runtime);
  try {
    const result = parse(argv);
    if ("kind" in result) { runtime.writeStdout(result.output); return result.exitCode; }
    return result.command === "doctor" ? await runDoctorAsync(result, runtime) : await runSetupAsync(result, runtime);
  } catch (error: unknown) {
    if (!(error instanceof CliError)) throw error;
    runtime.writeStderr(`fatal: ${formatCliError(error)}\n`);
    return 2;
  }
}