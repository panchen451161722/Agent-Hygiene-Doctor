#!/usr/bin/env node

import { CliError, parseCliOptions } from "./options.js";

try {
  parseCliOptions(process.argv.slice(2));
} catch (error: unknown) {
  if (!(error instanceof CliError)) {
    throw error;
  }

  process.stderr.write(`fatal: ${error.message}\n`);
  process.exitCode = 2;
}
