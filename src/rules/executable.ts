import posix from "node:path/posix";
import win32 from "node:path/win32";

import type { FsStat } from "../core/fs/backend.js";

export interface ExecutableMetadata {
  lstat(path: string): Promise<FsStat>;
}

export interface ResolveExecutableOptions {
  readonly platform: "posix" | "win32" | "darwin" | "linux";
  readonly cwd: string;
  readonly path: string | undefined;
  readonly pathext: string | undefined;
  readonly fs: ExecutableMetadata;
}

export interface ExecutableResolution {
  readonly status: "resolved" | "not-found" | "unknown";
  readonly path?: string;
}

const isWindows = (platform: ResolveExecutableOptions["platform"]): boolean => platform === "win32";

const isExecutable = (stat: FsStat, windows: boolean): boolean =>
  stat.type === "file" && (windows || ((stat.mode ?? 0) & 0o111) !== 0);

const canReadRegularFile = async (path: string, options: ResolveExecutableOptions): Promise<boolean> => {
  try {
    return isExecutable(await options.fs.lstat(path), isWindows(options.platform));
  } catch {
    return false;
  }
};

const windowsVariants = (base: string, extension: string): readonly string[] => {
  const directory = win32.dirname(base);
  const basename = win32.basename(base);
  const folded = win32.join(directory, basename.toLowerCase());
  const extensions = [...new Set([extension, extension.toLowerCase(), extension.toUpperCase()])];
  return [...new Set([base, folded].flatMap((value) => extensions.map((suffix) => `${value}${suffix}`)))];
};
/** Resolve only metadata-visible regular files; no shell, registry, or shebang lookup is used. */
export const resolveExecutable = async (
  command: string,
  options: ResolveExecutableOptions,
): Promise<ExecutableResolution> => {
  if (command.trim() === "") return { status: "unknown" };
  const pathApi = isWindows(options.platform) ? win32 : posix;
  const windows = isWindows(options.platform);
  const absolute = pathApi.isAbsolute(command);
  if (absolute) {
    const candidates = windows && pathApi.extname(command) === ""
      ? (options.pathext ?? "").split(";").filter(Boolean).flatMap((extension) => windowsVariants(command, extension))
      : [command];
    if (candidates.length === 0) return { status: "unknown" };
    for (const candidate of candidates) {
      if (await canReadRegularFile(candidate, options)) return { status: "resolved", path: candidate };
    }
    return { status: "not-found" };
  }
  if (command.includes("/") || command.includes("\\")) {
    const candidate = pathApi.resolve(options.cwd, command);
    return (await canReadRegularFile(candidate, options)) ? { status: "resolved", path: candidate } : { status: "not-found" };
  }
  if (options.path === undefined || options.path === "") return { status: "unknown" };
  const separator = windows ? ";" : ":";
  const directories = options.path.split(separator);
  if (directories.some((directory) => directory === "")) return { status: "unknown" };
  const extensions = windows
    ? (options.pathext ?? "").split(";").filter((extension) => extension.length > 0)
    : [""];
  if (extensions.length === 0) return { status: "unknown" };
  for (const directory of directories) {
    const base = pathApi.join(directory, command);
    const candidates = windows
      ? extensions.flatMap((extension) => windowsVariants(base, extension))
      : [base];
    for (const candidate of candidates) {
      if (await canReadRegularFile(candidate, options)) return { status: "resolved", path: candidate };
    }
  }
  return { status: "not-found" };
};

export const checkExecutable = resolveExecutable;
