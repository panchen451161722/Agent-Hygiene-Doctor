import { promises as nodeFs } from "node:fs";
import { dirname } from "node:path";
import type { CliRuntime } from "./main.js";
import type { SetupCliOptions } from "./options.js";
import { createScanContext, type ScanPlatform } from "../core/context.js";
import { nodeFsBackend } from "../core/fs/backend.js";
import { resolveSetupDestination, setupDestinations, type SetupAgent } from "../setup/destinations.js";
import { renderLauncher } from "../setup/launcher.js";
import { isManifest } from "../setup/manifest.js";
import { installOwnedFiles, uninstallOwnedFiles, type OwnedFileSystem } from "../setup/safe-write.js";

const PACKAGE_VERSION = "2.2.0";

const nodeOwnedFileSystem: OwnedFileSystem = {
  readFile: (path) => nodeFs.readFile(path, "utf8"),
  writeFile: (path, content) => nodeFs.writeFile(path, content, "utf8"),
  rename: (from, to) => nodeFs.rename(from, to),
  unlink: (path) => nodeFs.unlink(path),
};

const runtimePlatform = (): ScanPlatform => process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";

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

export const runSetupAsync = async (options: SetupCliOptions, runtime: CliRuntime): Promise<number> => {
  if (options.dryRun || !options.yes) return runSetup(options, runtime);

  try {
    const cwd = process.cwd();
    const context = await createScanContext({
      platform: runtimePlatform(),
      selectedWorkingDirectory: cwd,
      projectRoot: cwd,
      environment: process.env,
      fs: { lstat: async (path) => {
        try {
          const stat = await nodeFs.lstat(path);
          return stat.isDirectory() ? "directory" : "file";
        } catch { return null; }
      } },
      backend: nodeFsBackend,
      toolVersion: PACKAGE_VERSION,
    });
    const agents: readonly SetupAgent[] = options.agents.length === 0 ? setupDestinations : options.agents;
    for (const agent of agents) {
      const destination = resolveSetupDestination(agent, context);
      if (options.uninstall) {
        const rawManifest = await nodeOwnedFileSystem.readFile(destination.manifestPath);
        const manifest: unknown = JSON.parse(rawManifest);
        if (!isManifest(manifest)) throw new Error("AH-SETUP-CONFLICT");
        await uninstallOwnedFiles(nodeOwnedFileSystem, manifest, destination.manifestPath);
        await nodeFs.rmdir(destination.directory).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOTEMPTY" && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
      } else {
        await nodeFs.mkdir(dirname(destination.skillPath), { recursive: true });
        await installOwnedFiles(nodeOwnedFileSystem, [{ path: destination.skillPath, content: renderLauncher(PACKAGE_VERSION) }], destination.manifestPath);
      }
    }
    runtime.writeStdout(options.uninstall ? "setup uninstall complete\n" : "setup complete\n");
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error && error.message === "AH-SETUP-CONFLICT" ? "setup refused: destination is not an unmodified Agent Hygiene install\n" : "setup failed\n";
    runtime.writeStderr(message);
    return 2;
  }
};
