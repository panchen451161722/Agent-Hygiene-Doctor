import { parse as parseTomlDocument } from "smol-toml";

import type { ParseResult, ParserOptions } from "./types.js";
import { decodeUtf8, limitDiagnostic, parserDiagnostic, walkValue, type ParserInput } from "./common.js";

export const parseToml = <T = unknown>(input: ParserInput, options: ParserOptions = {}): ParseResult<T> => {
  const decoded = decodeUtf8(input, options);
  if (!decoded.ok) return decoded;
  let value: unknown;
  try {
    value = parseTomlDocument(decoded.text) as unknown;
  } catch {
    return { ok: false, diagnostic: parserDiagnostic(options, "invalid TOML") };
  }
  if (!walkValue(value, decoded.limits)) return { ok: false, diagnostic: limitDiagnostic(options) };
  return { ok: true, value: value as T };
};
