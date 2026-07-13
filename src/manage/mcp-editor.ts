import { parse as parseJsonc, parseTree, type Node as JsonNode, type ParseError } from "jsonc-parser";
import { isMap, parseDocument, type Node, type Pair, type YAMLMap } from "yaml";

import { parseToml } from "../core/parsers/toml.js";
import { parseYaml } from "../core/parsers/yaml.js";
import { RemovalError } from "./model.js";

export type McpFormat = "json" | "yaml" | "toml";
export type McpKey = "mcp_servers" | "mcpServers";

const unsupported = (): never => { throw new RemovalError("AH-REMOVE-UNSUPPORTED"); };
const parseValue = (text: string, format: McpFormat): unknown => {
  switch (format) {
    case "json": { const errors: ParseError[] = []; const value = parseJsonc(text, errors, { allowTrailingComma: true, disallowComments: false }); if (errors.length > 0) return unsupported(); return value; }
    case "yaml": { const result = parseYaml(text); if (!result.ok) return unsupported(); return (result as { readonly value: unknown }).value; }
    case "toml": { const result = parseToml(text); if (!result.ok) return unsupported(); return (result as { readonly value: unknown }).value; }
  }
};
const record = (value: unknown): Record<string, unknown> | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export const assertMcpPresent = (text: string, format: McpFormat, key: McpKey, name: string): void => {
  const root = record(parseValue(text, format));
  const servers = root === undefined ? undefined : record(root[key]);
  if (servers === undefined || !(name in servers)) unsupported();
};

const propertyName = (node: JsonNode): string | undefined => node.type === "property" ? node.children?.[0]?.value as string | undefined : undefined;
const removeJson = (text: string, key: McpKey, name: string): string => {
  const errors: ParseError[] = [];
  const root = parseJsonc(text, errors, { allowTrailingComma: true, disallowComments: false });
  const tree = parseTree(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0 || !record(root) || !record(root[key]) || !(name in (root[key] as Record<string, unknown>)) || tree?.type !== "object") return unsupported();
  const treeRoot = tree as JsonNode;
  const parent = treeRoot.children?.find((node) => propertyName(node) === key);
  const object = parent?.children?.[1];
  if (object?.type !== "object" || object.children === undefined) return unsupported();
  const properties = object.children as JsonNode[];
  const index = properties.findIndex((node) => propertyName(node) === name);
  const candidateTarget = properties[index];
  if (index < 0 || candidateTarget === undefined) return unsupported();
  const target = candidateTarget as JsonNode;
  const previous = index > 0 ? properties[index - 1] : undefined;
  const next = properties[index + 1];
  const start = next === undefined ? (previous === undefined ? target.offset : previous.offset + previous.length) : target.offset;
  const end = next === undefined ? target.offset + target.length : next.offset;
  const output = text.slice(0, start) + text.slice(end);
  assertMcpAbsent(output, "json", key, name);
  return output;
};

const lineStart = (text: string, offset: number): number => {
  const position = text.lastIndexOf("\n", Math.max(0, offset - 1));
  return position < 0 ? 0 : position + 1;
};
const lineEnd = (text: string, offset: number): number => {
  const position = text.indexOf("\n", offset);
  return position < 0 ? text.length : position + 1;
};

const removeYaml = (text: string, key: McpKey, name: string): string => {
  const document = parseDocument(text, { keepSourceTokens: true, uniqueKeys: true });
  if (document.errors.length > 0 || !isMap(document.contents)) unsupported();
  const root = document.contents as YAMLMap;
  const keyValue = (value: unknown): string => String((value as { readonly value?: unknown } | null)?.value ?? "");
  const candidate = root.items.find((pair) => keyValue(pair.key) === key)?.value;
  if (!isMap(candidate)) unsupported();
  const servers = candidate as YAMLMap;
  const pair = servers.items.filter((item) => keyValue(item.key) === name);
  if (pair.length !== 1) unsupported();
  const candidateTarget = pair[0];
  if (candidateTarget === undefined) return unsupported();
  const target = candidateTarget as Pair<Node, Node>;
  const targetKey = target.key;
  const targetValue = target.value;
  if (targetValue === null || targetKey.range === undefined || targetKey.range === null || targetValue.range === undefined || targetValue.range === null || targetKey.commentBefore || targetValue.commentBefore) return unsupported();
  const keyRange = targetKey.range as [number, number, number];
  const start = lineStart(text, keyRange[0]);
  const indent = text.slice(start, keyRange[0]).match(/^\s*/u)?.[0].length ?? 0;
  let end = lineEnd(text, start);
  while (end < text.length) {
    const nextEnd = lineEnd(text, end);
    const line = text.slice(end, nextEnd);
    const nonWhitespace = line.trim();
    const nextIndent = line.match(/^\s*/u)?.[0].length ?? 0;
    if (nonWhitespace !== "" && nextIndent <= indent) break;
    end = nextEnd;
  }
  const output = text.slice(0, start) + text.slice(end);
  assertMcpAbsent(output, "yaml", key, name);
  return output;
};

const unquoteToml = (value: string): string | undefined => {
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) as string; } catch { return undefined; }
  }
  return /^[A-Za-z0-9_-]+$/u.test(value) ? value : undefined;
};
const tablePath = (line: string): readonly string[] | undefined => {
  const text = line.trim();
  if (!text.startsWith("[") || text.startsWith("[[")) return undefined;
  let quoted = false;
  let escaped = false;
  let end = -1;
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && escaped) { escaped = false; continue; }
    if (quoted && character === "\\") { escaped = true; continue; }
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "]") { end = index; break; }
  }
  if (end < 0 || text.slice(end + 1).trim().replace(/#.*/u, "").trim() !== "") return undefined;
  const components: string[] = [];
  let current = "";
  quoted = false;
  escaped = false;
  for (const character of text.slice(1, end)) {
    if (quoted && escaped) { current += character; escaped = false; continue; }
    if (quoted && character === "\\") { current += character; escaped = true; continue; }
    if (character === '"') { quoted = !quoted; current += character; continue; }
    if (!quoted && character === ".") { const part = unquoteToml(current.trim()); if (part === undefined) return undefined; components.push(part); current = ""; } else current += character;
  }
  const final = unquoteToml(current.trim());
  return quoted || final === undefined ? undefined : [...components, final];
};
const startsWith = (value: readonly string[], prefix: readonly string[]): boolean => prefix.every((part, index) => value[index] === part);

/** A lexical table scanner, constrained by an independently validated TOML parse. */
const removeToml = (text: string, key: McpKey, name: string): string => {
  assertMcpPresent(text, "toml", key, name);
  const starts: Array<{ readonly offset: number; readonly path: readonly string[] }> = [];
  let offset = 0;
  for (const line of text.split(/(?<=\n)/u)) {
    const path = tablePath(line);
    if (path !== undefined) starts.push({ offset, path });
    offset += line.length;
  }
  const targetPath = [key, name];
  const targetIndex = starts.findIndex((entry) => entry.path.length === 2 && startsWith(entry.path, targetPath));
  if (targetIndex < 0) unsupported();
  let end = text.length;
  for (let index = targetIndex + 1; index < starts.length; index += 1) {
    const entry = starts[index];
    if (entry !== undefined && !startsWith(entry.path, targetPath)) { end = entry.offset; break; }
  }
  const startOffset = starts[targetIndex]?.offset;
  if (startOffset === undefined) return unsupported();
  const output = text.slice(0, startOffset as number) + text.slice(end);
  assertMcpAbsent(output, "toml", key, name);
  return output;
};

export const assertMcpAbsent = (text: string, format: McpFormat, key: McpKey, name: string): void => {
  const root = record(parseValue(text, format));
  const servers = root === undefined ? undefined : record(root[key]);
  if (servers !== undefined && name in servers) unsupported();
};

export const removeMcpFromText = (text: string, format: McpFormat, key: McpKey, name: string): string => {
  assertMcpPresent(text, format, key, name);
  return format === "json" ? removeJson(text, key, name) : format === "yaml" ? removeYaml(text, key, name) : removeToml(text, key, name);
};
