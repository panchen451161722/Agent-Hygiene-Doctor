import { SCAN_LIMITS_V1, type ScanLimitsV1 } from "./limits.js";
import { createPathDialect, type PathDialect } from "./path-dialect.js";
import { findGenericProjectRoot, type MetadataFileSystem } from "./project-root.js";
import { RootRegistry } from "./root-registry.js";
import type { FsBackend } from "./fs/backend.js";
import { SafeFileSystem } from "./fs/safe-fs.js";
import { ScanIoSemaphore } from "./fs/semaphore.js";

export const ALLOWLISTED_ENVIRONMENT_KEYS = ["HOME", "USERPROFILE", "LOCALAPPDATA", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "HERMES_HOME", "HERMES_ENABLE_PROJECT_PLUGINS", "PATH", "PATHEXT"] as const;
export type AllowlistedEnvironment = Readonly<Record<(typeof ALLOWLISTED_ENVIRONMENT_KEYS)[number], string | undefined>>;
export type AbsolutePath = string & { readonly __absolutePath: unique symbol };
export type ScanPlatform = "win32" | "darwin" | "linux";
export interface ScanClock { now(): Date | string; }
export interface ScanContextFileSystem extends MetadataFileSystem { readonly [key: string]: unknown; }
export interface ScanContext { readonly platform: ScanPlatform; readonly paths: PathDialect; readonly selectedWorkingDirectory: AbsolutePath; readonly genericProjectRoot: AbsolutePath; readonly userHome: AbsolutePath; readonly environment: AllowlistedEnvironment; readonly roots: RootRegistry; readonly fs: ScanContextFileSystem; readonly ioSemaphore: ScanIoSemaphore; readonly safeFs?: SafeFileSystem; readonly limits: Readonly<ScanLimitsV1>; readonly clock: ScanClock; readonly toolVersion: string; }
export interface CreateScanContextOptions { readonly platform: ScanPlatform; readonly paths?: PathDialect; readonly selectedWorkingDirectory: string; readonly projectRoot?: string; readonly environment: Readonly<Record<string, string | undefined>>; readonly fs: ScanContextFileSystem; readonly backend?: FsBackend; readonly clock?: ScanClock; readonly toolVersion: string; readonly limits?: ScanLimitsV1; readonly roots?: RootRegistry; readonly ioSemaphore?: ScanIoSemaphore; }
const deepFreeze = <T>(value: T): Readonly<T> => { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); return value; };
const snapshotEnvironment = (environment: Readonly<Record<string, string | undefined>>): AllowlistedEnvironment => deepFreeze(Object.fromEntries(ALLOWLISTED_ENVIRONMENT_KEYS.map((key) => [key, environment[key]])) as Record<(typeof ALLOWLISTED_ENVIRONMENT_KEYS)[number], string | undefined>) as AllowlistedEnvironment;
const defaultClock: ScanClock = Object.freeze({ now: () => new Date() });
export const createScanContext = async (options: CreateScanContextOptions): Promise<ScanContext> => {
  const paths = options.paths ?? createPathDialect(options.platform); const selectedWorkingDirectory = paths.normalize(options.selectedWorkingDirectory) as AbsolutePath;
  if (paths.platform !== (options.platform === "win32" ? "win32" : "posix")) throw new Error("AH-INVALID-PATH-DIALECT: dialect does not match the scan platform");
  const environment = snapshotEnvironment(options.environment); const homeValue = options.platform === "win32" ? environment.USERPROFILE ?? environment.HOME : environment.HOME ?? environment.USERPROFILE;
  if (homeValue === undefined) throw new Error("AH-MISSING-HOME: a user home path is required");
  const userHome = paths.normalize(homeValue) as AbsolutePath; const genericProjectRoot = options.projectRoot === undefined ? await findGenericProjectRoot(selectedWorkingDirectory, paths, options.fs) : paths.normalize(options.projectRoot);
  if (!paths.contains(genericProjectRoot, selectedWorkingDirectory)) throw new Error("AH-INVALID-PROJECT-ROOT: project root must contain the selected working directory");
  const roots = options.roots ?? RootRegistry.create(paths, [
    { id: "project", kind: "project", alias: "<project>", absolutePath: genericProjectRoot }, { id: "home", kind: "home", alias: "~", absolutePath: userHome },
    { id: "codex-home", kind: "agent-home", alias: "$CODEX_HOME", absolutePath: environment.CODEX_HOME ?? paths.join(userHome, ".codex") },
    { id: "claude-home", kind: "agent-home", alias: "$CLAUDE_CONFIG_DIR", absolutePath: environment.CLAUDE_CONFIG_DIR ?? paths.join(userHome, ".claude") },
    { id: "hermes-home", kind: "agent-home", alias: "$HERMES_HOME", absolutePath: environment.HERMES_HOME ?? (options.platform === "win32" ? paths.join(environment.LOCALAPPDATA ?? paths.join(userHome, "AppData", "Local"), "hermes") : paths.join(userHome, ".hermes")) },
  ]);
  const limits = deepFreeze({ ...(options.limits ?? SCAN_LIMITS_V1) }) as Readonly<ScanLimitsV1>; const ioSemaphore = options.ioSemaphore ?? new ScanIoSemaphore(limits.maxConcurrentFsOps);
  const safeFs = options.backend === undefined ? undefined : new SafeFileSystem({ backend: options.backend, dialect: paths, semaphore: ioSemaphore, limits, rootRegistry: roots });
  return Object.freeze({ platform: options.platform, paths, selectedWorkingDirectory, genericProjectRoot: genericProjectRoot as AbsolutePath, userHome, environment, roots, fs: options.fs, ioSemaphore, ...(safeFs === undefined ? {} : { safeFs }), limits, clock: options.clock ?? defaultClock, toolVersion: options.toolVersion }) as ScanContext;
};