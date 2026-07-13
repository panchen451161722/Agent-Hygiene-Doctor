import type { InventoryItem, McpFacts } from "../core/inventory.js";
import { credentialLikeNames, fingerprintInput, fingerprintMcp, type McpFingerprintInput } from "../rules/mcp-fingerprint.js";
import { recognizePackageInvocation } from "../rules/package-spec.js";
import { item, type InspectorContext } from "./common.js";

type McpInputCommon = {
  readonly name?: string;
  readonly commandResolution?: McpFacts["commandResolution"];
  readonly urlClass?: McpFacts["urlClass"];
};

export type McpInput =
  | (McpInputCommon & { readonly transport: "stdio"; readonly command?: string; readonly args?: readonly string[]; readonly environmentNames?: readonly string[] })
  | (McpInputCommon & { readonly transport: "http" | "sse"; readonly url: string; readonly headerNames?: readonly string[] });

const fingerprintableInput = (input: McpInput): McpFingerprintInput => input.transport === "stdio"
  ? { transport: "stdio", ...(input.command === undefined ? {} : { command: input.command }), ...(input.args === undefined ? {} : { args: input.args }), ...(input.environmentNames === undefined ? {} : { env: Object.fromEntries(input.environmentNames.map((name) => [name, undefined])) }) }
  : { transport: input.transport, url: input.url, ...(input.headerNames === undefined ? {} : { headers: Object.fromEntries(input.headerNames.map((name) => [name, undefined])) }) };

export const inspectMcp = (input: McpInput, context: InspectorContext): InventoryItem => {
  const fingerprintInputValue = fingerprintableInput(input);
  const fp = fingerprintInput(fingerprintInputValue);
  let facts: McpFacts;
  if (input.transport === "stdio") {
    const packageInvocation = input.command === undefined
      ? "unknown"
      : recognizePackageInvocation(input.command, input.args ?? [])?.pin ?? "not-applicable";
    facts = {
      type: "mcp",
      transport: "stdio",
      endpointFingerprint: fingerprintMcp(fingerprintInputValue),
      commandResolution: input.commandResolution ?? "unknown",
      packageInvocation,
      credentialLikeFields: credentialLikeNames(input.environmentNames ?? []),
    };
  } else {
    facts = {
      type: "mcp",
      transport: input.transport,
      endpointFingerprint: fingerprintMcp(fingerprintInputValue),
      credentialLikeFields: credentialLikeNames(input.headerNames ?? []),
      urlClass: input.urlClass ?? "unknown",
    };
  }
  const name = input.name?.trim() || (typeof fp.command === "string" ? fp.command : context.source.relativePath);
  return item(context, "mcp", name, facts, facts.endpointFingerprint);
};