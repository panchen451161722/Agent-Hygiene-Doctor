import { TextDecoder } from "node:util";

import { DIAGNOSTIC_MESSAGES, type Diagnostic } from "../diagnostic.js";
import type { ParserLimits, ParserOptions } from "./types.js";
import { resolveParserLimits } from "./types.js";

export type ParserInput = string | Uint8Array;

export const decodeUtf8 = (input: ParserInput, options?: ParserOptions):
  | { readonly ok: true; readonly text: string; readonly limits: ParserLimits }
  | { readonly ok: false; readonly diagnostic: Diagnostic } => {
  const limits = resolveParserLimits(options);
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > limits.maxBytes) return { ok: false, diagnostic: parserDiagnostic(options, "input exceeds parser size limit") };
  try {
    let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.codePointAt(0) === 0xfeff) text = text.slice(1);
    return { ok: true, text, limits };
  } catch {
    return { ok: false, diagnostic: parserDiagnostic(options, "input is not valid UTF-8") };
  }
};

export const parserDiagnostic = (options: ParserOptions | undefined, _reason: string): Diagnostic => ({
  code: "parse_error",
  severity: "error",
  ...(options?.source === undefined ? {} : { source: options.source }),
  coverageImpact: "partial",
  message: DIAGNOSTIC_MESSAGES.parse_error,
});

export const limitDiagnostic = (options: ParserOptions): Diagnostic => ({
  code: "limit_exceeded",
  severity: "warning",
  ...(options.source === undefined ? {} : { source: options.source }),
  coverageImpact: "partial",
  message: DIAGNOSTIC_MESSAGES.limit_exceeded,
});

export const walkValue = (
  value: unknown,
  limits: ParserLimits,
): boolean => {
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop() as { readonly value: unknown; readonly depth: number };
    nodes += 1;
    if (nodes > limits.maxNodes || current.depth > limits.maxDepth) return false;
    if (typeof current.value !== "object" || current.value === null) continue;
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current.value[index], depth: current.depth + 1 });
      }
    } else {
      const entries = Object.entries(current.value);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        stack.push({ value: entries[index]?.[1], depth: current.depth + 1 });
      }
    }
  }
  return true;
};
