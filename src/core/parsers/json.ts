import { parse as parseJsoncText } from "jsonc-parser";

import type { ParseResult, ParserOptions } from "./types.js";
import { decodeUtf8, limitDiagnostic, parserDiagnostic, walkValue, type ParserInput } from "./common.js";

export const parseJson = <T = unknown>(input: ParserInput, options: ParserOptions = {}): ParseResult<T> => {
  const decoded = decodeUtf8(input, options);
  if (!decoded.ok) return decoded;
  let value: unknown;
  try {
    value = JSON.parse(decoded.text) as unknown;
  } catch {
    return { ok: false, diagnostic: parserDiagnostic(options, "invalid JSON") };
  }
  if (!walkValue(value, decoded.limits)) return { ok: false, diagnostic: limitDiagnostic(options) };
  return { ok: true, value: value as T };
};

/** JSON-with-comments is accepted only for agent configuration files that support it. */
export const parseJsonc = <T = unknown>(input: ParserInput, options: ParserOptions = {}): ParseResult<T> => {
  const decoded = decodeUtf8(input, options);
  if (!decoded.ok) return decoded;
  const errors: { error: number; offset: number; length: number }[] = [];
  const value = parseJsoncText(decoded.text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0 || value === undefined) return { ok: false, diagnostic: parserDiagnostic(options, "invalid JSONC") };
  if (!walkValue(value, decoded.limits)) return { ok: false, diagnostic: limitDiagnostic(options) };
  return { ok: true, value: value as T };
};

export const parseJSON = parseJson;