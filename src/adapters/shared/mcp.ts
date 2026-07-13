import type { McpFacts } from "../../core/inventory.js";
import type { McpInput } from "../../inspectors/mcp.js";

export interface McpProjection {
  readonly name: string;
  readonly status: "active" | "disabled" | "unresolved";
  readonly input: McpInput;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): readonly string[] | undefined => Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
const fieldNames = (value: unknown): readonly string[] | undefined => {
  if (!isRecord(value) || !Object.values(value).every((entry) => typeof entry === "string")) return undefined;
  return Object.keys(value).sort((left, right) => left.localeCompare(right, "en"));
};

export const classifyMcpUrl = (raw: string): NonNullable<McpFacts["urlClass"]> => {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(host)) return "loopback";
    if (url.protocol === "https:") return "tls";
    if (url.protocol === "http:") return "plaintext-remote";
    return "unknown";
  } catch {
    return "unknown";
  }
};

const projectServer = (name: string, value: unknown): McpProjection => {
  if (!isRecord(value)) return { name, status: "unresolved", input: { name, transport: "stdio" } };
  const status = value.enabled === false ? "disabled" as const : "active" as const;
  if (typeof value.command === "string") {
    const args = value.args === undefined ? [] : strings(value.args);
    if (args === undefined) return { name, status: "unresolved", input: { name, transport: "stdio" } };
    const environmentNames = fieldNames(value.env);
    return { name, status, input: { name, transport: "stdio", command: value.command, args, ...(environmentNames === undefined ? {} : { environmentNames }) } };
  }
  if (typeof value.url === "string") {
    const declared = value.transport ?? value.type;
    if (declared !== undefined && declared !== "http" && declared !== "sse") return { name, status: "unresolved", input: { name, transport: "stdio" } };
    const transport = declared === "sse" ? "sse" : "http";
    const headerNames = fieldNames(value.headers);
    return { name, status, input: { name, transport, url: value.url, urlClass: classifyMcpUrl(value.url), ...(headerNames === undefined ? {} : { headerNames }) } };
  }
  return { name, status: "unresolved", input: { name, transport: "stdio" } };
};

export const projectMcpServers = (value: unknown, key = "mcp_servers"): readonly McpProjection[] => {
  if (!isRecord(value) || !isRecord(value[key])) return [];
  return Object.entries(value[key])
    .map(([name, server]) => projectServer(name, server))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
};

export const projectCodexMcp = (value: unknown): readonly McpProjection[] => projectMcpServers(value);