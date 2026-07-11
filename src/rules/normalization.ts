import { createHash } from "node:crypto";

/** Normalize user-authored text without changing case or internal spacing. */
export const normalizeText = (value: string): string => {
  const withoutBom = value.startsWith("\uFEFF") ? value.slice(1) : value;
  const lines = withoutBom.replace(/\r\n|\r/g, "\n").normalize("NFC").split("\n")
    .map((line) => line.replace(/[\t ]+$/u, ""));
  while (lines.length > 0 && lines[0]?.trim() === "") lines.shift();
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  return lines.join("\n");
};

/** Canonical names use Unicode NFC and ASCII-only case folding. */
export const normalizeName = (value: string): string =>
  value.normalize("NFC").trim().replace(/[A-Z]/g, (character) => character.toLowerCase());

export const normalizedContentFingerprint = (value: string): string =>
  createHash("sha256").update(Buffer.from(normalizeText(value), "utf8")).digest("hex");

export const fingerprintText = normalizedContentFingerprint;
