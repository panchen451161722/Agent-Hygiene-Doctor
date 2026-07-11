import { SCAN_LIMITS_V1, type ScanLimitsV1 } from "./limits.js";
import { createPathDialect, type PathDialect } from "./path-dialect.js";
import { findGenericProjectRoot, type MetadataFileSystem } from "./project-root.js";
import { RootRegistry } from "./root-registry.js";
import { ScanIoSemaphore } from "./fs/semaphore.js";

export const ALLOWLISTED_ENVIRONMENT_KEYS = [
  "HOME", "USERPROFILE", "LOCALAPPDATA", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "HERMES_HOME",
  "HERMES_ENABLE_PROJECT_PLUGINS", "PATH", "PATHEXT",
] as const;

export type AllowlistedEnvironment = Readonly<Record<(typeof ALLOWLISTED_ENVIRONMENT_KEYS)[number], string | undefined>>;
export type AbsolutePath = string & { readonly __absolutePath: unique symbol };
export type ScanPlatform = "win32" | "darwin" | "linux";

export interface ScanClock {
  now(): Date | string;
}

export interface ScanContextFileSystem extends MetadataFileSystem {
  readonly [key: string]: unknown;
}

export interface ScanContext {
  readonly platform: ScanPlatform;
  readonly paths: PathDialect;
  readonly selectedWorkingDirectory: AbsolutePath;
  readonly genericProjectRoot: AbsolutePath;
  readonly userHome: AbsolutePath;
  readonly environment: AllowlistedEnvironment;
  readonly roots: RootRegistry;
  readonly fs: ScanContextFileSystem;
  readonly ioSemaphore: ScanIoSemaphore;
  readonly limits: Readonly<ScanLimitsV1>;
  readonly clock: ScanClock;
  readonly toolVersion: string;
}

export interface CreateScanContextOptions {
  readonly platform: ScanPlatform;
  readonly paths?: PathDialect;
  readonly selectedWorkingDirectory: string;
  readonly projectRoot?: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly fs: ScanContextFileSystem;
  readonly clock?: ScanClock;
  readonly toolVersion: string;
  readonly limits?: ScanLimitsV1;
  readonly roots?: RootRegistry;
  readonly ioSemaphore?: ScanIoSemaphore;
}

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
  return value;
};

const snapshotEnvironment = (environment: Readonly<Record<string, string | undefined>>): AllowlistedEnvironment => {
  const snapshot = Object.fromEntries(ALLOWLISTED_ENVIRONMENT_KEYS.map((key) => [key, environment[key]])) as Record<
    (typeof ALLOWLISTED_ENVIRONMENT_KEYS)[number], string | undefined
  >;
  return deepFreeze(snapshot) as AllowlistedEnvironment;
};

const defaultClock: ScanClock = Object.freeze({ now: () => new Date() });

export const createScanContext = async (options: CreateScanContextOptions): Promise<ScanContext> => {
  const paths = options.paths ?? createPathDialect(options.platform);
  const selectedWorkingDirectory = paths.normalize(options.selectedWorkingDirectory) as AbsolutePath;
  const expectedDialectPlatform = options.platform === "win32" ? "win32" : "posix";
  if (paths.platform !== expectedDialectPlatform) {
    throw new Error("AH-INVALID-PATH-DIALECT: dialect does not match the scan platform");
  }
  const environment = snapshotEnvironment(options.environment);
  const homeValue = options.platform === "win32"
    ? environment.USERPROFILE ?? environment.HOME
    : environment.HOME ?? environment.USERPROFILE;
  if (homeValue === undefined) throw new Error("AH-MISSING-HOME: a user home path is required");
  const userHome = paths.normalize(homeValue) as AbsolutePath;
  const genericProjectRoot = options.projectRoot === undefined
    ? await findGenericProjectRoot(selectedWorkingDirectory, paths, options.fs)
    : paths.normalize(options.projectRoot);
  if (!paths.contains(genericProjectRoot, selectedWorkingDirectory)) {
    throw new Error("AH-INVALID-PROJECT-ROOT: project root must contain the selected working directory");
  }
  const roots = options.roots ?? RootRegistry.create(paths, [
    { id: "project", kind: "project", alias: "<project>", absolutePath: genericProjectRoot },
    { id: "home", kind: "home", alias: "~", absolutePath: userHome },
  ]);
  const context: ScanContext = {
    platform: options.platform,
    paths,
    selectedWorkingDirectory,
    genericProjectRoot: genericProjectRoot as AbsolutePath,
    userHome,
    environment,
    roots,
    fs: options.fs,
    ioSemaphore: options.ioSemaphore ?? new ScanIoSemaphore((options.limits ?? SCAN_LIMITS_V1).maxConcurrentFsOps),
    limits: deepFreeze({ ...(options.limits ?? SCAN_LIMITS_V1) }) as Readonly<ScanLimitsV1>,
    clock: options.clock ?? defaultClock,
    toolVersion: options.toolVersion,
  };
  return Object.freeze(context) as ScanContext;
};
