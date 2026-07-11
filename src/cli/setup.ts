import type { CliRuntime } from "./main.js";
import type { SetupCliOptions } from "./options.js";

export const runSetup = (options: SetupCliOptions, runtime: CliRuntime): number => {
  if (options.dryRun) {
    runtime.writeStdout(`setup dry-run${options.uninstall ? " uninstall" : ""}\n`);
    return 0;
  }
  if (!options.yes) {
    runtime.writeStderr("setup requires --yes; use --dry-run to preview changes\n");
    return 2;
  }
  runtime.writeStdout(options.uninstall ? "setup uninstall complete\n" : "setup complete\n");
  return 0;
};
