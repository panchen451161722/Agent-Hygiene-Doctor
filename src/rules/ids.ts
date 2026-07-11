import { createHash } from "node:crypto";

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const stableValue = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    return value;
  }
  if (Array.isArray(value)) return value.map(stableValue);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort(compare).map((key) => [key, stableValue(record[key])]));
};

export const stableSerialize = (value: unknown): string => JSON.stringify(stableValue(value));

export const stableId = (tuple: readonly unknown[]): string =>
  createHash("sha256").update(stableSerialize(tuple), "utf8").digest("hex");

export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
