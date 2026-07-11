#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  CliError,
  formatCliError,
  parseCliOptions,
} from "./options.js";
import { runDoctor } from "./doctor.js";
import { runSetup } from "./setup.js";

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

    return result.command === "doctor" ? runDoctor(result, runtime) : runSetup(result);
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
  import.meta.url === pathToFileURL(executablePath).href
) {
  process.exitCode = runCli(process.argv.slice(2));
}
