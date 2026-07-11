import { isAlias, isCollection, isPair, parseDocument } from "yaml";

import type { Diagnostic } from "../diagnostic.js";
import type { ParseResult, ParserOptions } from "./types.js";
import { decodeUtf8, limitDiagnostic, parserDiagnostic, type ParserInput } from "./common.js";

interface YamlNodeLike {
  readonly type?: unknown;
  readonly items?: readonly unknown[];
  readonly key?: unknown;
  readonly value?: unknown;
}

const locatedDiagnostic = (options: ParserOptions, line: number | undefined, column: number | undefined): Diagnostic => ({
  ...parserDiagnostic(options, "invalid YAML"),
  ...(line === undefined ? {} : { line }),
  ...(column === undefined ? {} : { column }),
});

const inspectDocument = (root: unknown, maxDepth: number, maxNodes: number, maxAliases: number):
  { readonly ok: true; readonly aliases: number } | { readonly ok: false; readonly aliases: number } => {
  const stack: Array<{ readonly node: unknown; readonly depth: number }> = [{ node: root, depth: 0 }];
  let nodes = 0;
  let aliases = 0;
  while (stack.length > 0) {
    const current = stack.pop() as { readonly node: unknown; readonly depth: number };
    if (current.node === undefined || current.node === null) continue;
    nodes += 1;
    if (nodes > maxNodes || current.depth > maxDepth) return { ok: false, aliases };
    if (isAlias(current.node)) {
      aliases += 1;
      if (aliases > maxAliases) return { ok: false, aliases };
      continue;
    }
    if (isPair(current.node)) {
      const pair = current.node as unknown as YamlNodeLike;
      stack.push({ node: pair.value, depth: current.depth + 1 });
      stack.push({ node: pair.key, depth: current.depth + 1 });
      continue;
    }
    if (isCollection(current.node)) {
      const collection = current.node as unknown as YamlNodeLike;
      const items = collection.items ?? [];
      for (let index = items.length - 1; index >= 0; index -= 1) {
        stack.push({ node: items[index], depth: current.depth + 1 });
      }
    }
  }
  return { ok: true, aliases };
};

export const parseYaml = <T = unknown>(input: ParserInput, options: ParserOptions = {}): ParseResult<T> => {
  const decoded = decodeUtf8(input, options);
  if (!decoded.ok) return decoded;
  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(decoded.text, { version: "1.2", uniqueKeys: false });
  } catch {
    return { ok: false, diagnostic: parserDiagnostic(options, "invalid YAML") };
  }
  const firstError = document.errors[0];
  if (firstError !== undefined) {
    const position = firstError.linePos?.[0];
    return { ok: false, diagnostic: locatedDiagnostic(options, position?.line, position?.col) };
  }
  const inspected = inspectDocument(document.contents, decoded.limits.maxDepth, decoded.limits.maxNodes, decoded.limits.maxYamlAliases);
  if (!inspected.ok) return { ok: false, diagnostic: limitDiagnostic(options) };
  try {
    const value = document.toJS({ maxAliasCount: decoded.limits.maxYamlAliases }) as T;
    return { ok: true, value };
  } catch {
    return { ok: false, diagnostic: limitDiagnostic(options) };
  }
};

export const parseYAML = parseYaml;
