import { stableId, stableSerialize } from "./ids.js";
import { recognizePackageInvocation, type PackageInvocation } from "./package-spec.js";

export interface StdioMcpInput {
  readonly transport: "stdio";
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface HttpMcpInput {
  readonly transport: "http" | "sse";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export type McpFingerprintInput = StdioMcpInput | HttpMcpInput;
export type SafeMcpFingerprintInput = Readonly<Record<string, unknown>>;

const credentialPattern = /(?:^|[-_])(?:token|secret|password|api[-_]?key|authorization|bearer|credential)(?:$|[-_])/iu;

export const credentialLikeNames = (names: readonly string[]): readonly string[] => [...new Set(names.filter((name) => credentialPattern.test(name)))].sort((left, right) => left.localeCompare(right, "en"));

export const credentialLikeFieldNames = (value: unknown): readonly string[] =>
  typeof value !== "object" || value === null || Array.isArray(value)
    ? []
    : credentialLikeNames(Object.keys(value as Record<string, unknown>));

const safeCommand = (command: string | undefined): string => {
  const value = command?.trim() ?? "";
  if (value === "") return "unknown";
  if (/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(value)) return "<absolute-path>";
  return value.toLowerCase();
};

const argumentShape = (value: string): string => {
  if (/^-{1,2}[A-Za-z][A-Za-z0-9_-]*(?:=.*)?$/u.test(value)) return value.split("=", 1)[0] ?? "<option>";
  if (/^(?:https?|sse?):\/\//iu.test(value)) return "<url>";
  if (/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(value)) return "<path>";
  if (/^[A-Za-z0-9+/=_-]{24,}$/u.test(value)) return "<opaque>";
  return "<value>";
};

const safeRunner = (command: string | undefined, args: readonly string[]): PackageInvocation | undefined =>
  command === undefined ? undefined : recognizePackageInvocation(command, args);

const httpShape = (input: HttpMcpInput): SafeMcpFingerprintInput => {
  try {
    const url = new URL(input.url);
    const scheme = url.protocol.slice(0, -1).toLowerCase();
    const host = url.hostname.toLowerCase();
    const defaultPort = (scheme === "http" && url.port === "80") || (scheme === "https" && url.port === "443");
    const path = url.pathname.split("/").filter((part) => part !== "").map((part) =>
      part === "." || part === ".." || part.length >= 16 || /^[A-Za-z0-9+/=_-]{12,}$/u.test(part) ? "<segment>" : part,
    ).join("/");
    const queryNames = [...new Set([...url.searchParams.keys()].map((key) => key.toLowerCase()))].sort();
    const result: Record<string, unknown> = { transport: input.transport, scheme, host, path: `/${path}`, queryNames };
    if (!defaultPort && url.port !== "") result.port = Number(url.port);
    return result;
  } catch {
    return { transport: input.transport, scheme: "unknown", host: "unknown", path: "unknown", queryNames: [] };
  }
};

export const fingerprintInput = (input: McpFingerprintInput): SafeMcpFingerprintInput => {
  if (input.transport === "stdio") {
    const args = input.args ?? [];
    const runner = safeRunner(input.command, args);
    const result: Record<string, unknown> = {
      transport: "stdio",
      command: safeCommand(input.command),
      options: args.filter((arg) => /^-/.test(arg)).map((arg) => argumentShape(arg)),
      arguments: args.filter((arg) => !/^-/.test(arg)).map(argumentShape),
      environmentNames: Object.keys(input.env ?? {}).sort(),
    };
    if (runner !== undefined) result.package = { runner: runner.runner, packageName: runner.packageName, pin: runner.pin };
    return result;
  }
  return httpShape(input);
};

export const fingerprintMcp = (input: McpFingerprintInput): string => stableId([fingerprintInput(input)]);
export const canonicalMcpFingerprintInput = fingerprintInput;
export const serializeFingerprintInput = (input: McpFingerprintInput): string => stableSerialize(fingerprintInput(input));
