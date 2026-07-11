export type PackageRunner = "npx" | "npm-exec" | "pnpm-dlx" | "yarn-dlx" | "bunx";
export type PackagePin = "exact" | "unpinned" | "not-applicable" | "unknown";

export interface PackageInvocation {
  readonly runner: PackageRunner;
  readonly packageSpec: string;
  readonly packageName: string;
  readonly pin: PackagePin;
  readonly pinned: boolean;
}

const runnerName = (command: string): string => {
  const base = command.replaceAll("\\", "/").split("/").at(-1) ?? "";
  return base.replace(/\.(?:cmd|exe|bat)$/iu, "").toLowerCase();
};

const packageNameAndVersion = (spec: string): { packageName: string; version?: string } => {
  if (spec.startsWith("@")) {
    const at = spec.indexOf("@", 1);
    if (at > 0) return { packageName: spec.slice(0, at), version: spec.slice(at + 1) };
    return { packageName: spec };
  }
  const at = spec.lastIndexOf("@");
  return at > 0 ? { packageName: spec.slice(0, at), version: spec.slice(at + 1) } : { packageName: spec };
};

const packageShape = /^[A-Za-z0-9_.@/\\-^~*]+$/u;
const exactSemver = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const fullCommit = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;

const pinFor = (version: string | undefined): PackagePin => {
  if (version === undefined || version === "") return "unpinned";
  return exactSemver.test(version) || fullCommit.test(version) ? "exact" : "unpinned";
};

const firstSpec = (args: readonly string[], start = 0): string | undefined => {
  let passthrough = false;
  for (const arg of args.slice(start)) {
    if (!passthrough && arg === "--") { passthrough = true; continue; }
    if (!passthrough && arg.startsWith("-")) continue;
    return arg;
  }
  return undefined;
};

/** Recognize package-manager wrappers without invoking them or resolving packages. */
export const recognizePackageInvocation = (command: string, args: readonly string[]): PackageInvocation | undefined => {
  const commandTokens = command.trim().split(/\s+/u);
  const name = runnerName(commandTokens[0] ?? command);
  const commandArgs = commandTokens.length > 1 ? [...commandTokens.slice(1), ...args] : args;
  let runner: PackageRunner | undefined;
  let spec: string | undefined;
  if (name === "npx") { runner = "npx"; spec = firstSpec(commandArgs); }
  else if (name === "npm" && commandArgs[0] === "exec") { runner = "npm-exec"; spec = firstSpec(commandArgs, 1); }
  else if (name === "pnpm" && commandArgs[0] === "dlx") { runner = "pnpm-dlx"; spec = firstSpec(commandArgs, 1); }
  else if (name === "yarn" && commandArgs[0] === "dlx") { runner = "yarn-dlx"; spec = firstSpec(commandArgs, 1); }
  else if (name === "bunx") { runner = "bunx"; spec = firstSpec(commandArgs); }
  if (runner === undefined || spec === undefined || !packageShape.test(spec)) return undefined;
  const parsed = packageNameAndVersion(spec);
  const pin = pinFor(parsed.version);
  return Object.freeze({ runner, packageSpec: spec, packageName: parsed.packageName, pin, pinned: pin === "exact" });
};

export const parsePackageSpec = recognizePackageInvocation;
export const isPinnedPackageSpec = (spec: string): boolean => pinFor(packageNameAndVersion(spec).version) === "exact";
