import type { SourceRef } from "./source-ref.js";

const SECRET_KEY = /(?:pass(?:word)?|secret|token|api[-_]?key|credential|authorization|private[-_]?key)/i;
const SECRET_LITERAL = /\b(?:Bearer\s+|Basic\s+|sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|AKIA[0-9A-Z]{12,})\S*/g;
const INLINE_SECRET = /((?:password|secret|token|api[-_]?key|authorization)\s*[:=]\s*["']?)([^\s,"'}]+)/gi;

const redactString = (value: string): string => value
  .replace(SECRET_LITERAL, "[REDACTED]")
  .replace(INLINE_SECRET, "$1[REDACTED]");

const redactValue = (value: unknown, key: string | undefined, seen: WeakSet<object>): unknown => {
  if (typeof value === "string") return key !== undefined && SECRET_KEY.test(key) ? "[REDACTED]" : redactString(value);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[REDACTED_CYCLE]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, undefined, seen));
  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = SECRET_KEY.test(childKey) ? "[REDACTED]" : redactValue(childValue, childKey, seen);
  }
  return output;
};

/** Final defense-in-depth pass; parsers remain the primary privacy boundary. */
export const redactOutput = <T>(value: T): T => redactValue(value, undefined, new WeakSet<object>()) as T;

export const safeBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

export const safeNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const safeEnumString = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === "string" && allowed.includes(value as T) ? value as T : undefined;

export const safeEnvironmentName = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Z_][A-Z0-9_]{0,127}$/.test(value) ? value : undefined;

export const safeFieldName = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(value) ? value : undefined;

export const safePathReference = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes("\0")) return undefined;
  const normalized = value.replace(/^\.\//, "");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return undefined;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return undefined;
  return normalized;
};

export const safeSourceRef = (value: unknown): SourceRef | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as { rootId?: unknown; relativePath?: unknown };
  const rootId = safeFieldName(candidate.rootId);
  const relativePath = candidate.relativePath === "." ? "." : safePathReference(candidate.relativePath);
  return rootId !== undefined && relativePath !== undefined ? { rootId, relativePath } : undefined;
};
