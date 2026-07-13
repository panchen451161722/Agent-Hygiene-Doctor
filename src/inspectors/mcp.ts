import type { InventoryItem, McpFacts } from "../core/inventory.js";
import { credentialLikeFieldNames, fingerprintInput, fingerprintMcp, type McpFingerprintInput } from "../rules/mcp-fingerprint.js";
import { recognizePackageInvocation } from "../rules/package-spec.js";
import { item, type InspectorContext } from "./common.js";

export type McpInput = McpFingerprintInput & {
  readonly name?: string;
  readonly commandResolution?: McpFacts["commandResolution"];
  readonly urlClass?: McpFacts["urlClass"];
};

export const inspectMcp = (input: McpInput, context: InspectorContext): InventoryItem => {
  const fp = fingerprintInput(input);
  let facts: McpFacts;
  if (input.transport === "stdio") {
    const packageInvocation = input.command === undefined
      ? "unknown"
      : recognizePackageInvocation(input.command, input.args ?? [])?.pin ?? "not-applicable";
    facts = {
      type: "mcp",
      transport: "stdio",
      endpointFingerprint: fingerprintMcp(input),
      commandResolution: input.commandResolution ?? "unknown",
      packageInvocation,
      credentialLikeFields: credentialLikeFieldNames(input.env),
    };
  } else {
    facts = {
      type: "mcp",
      transport: input.transport,
      endpointFingerprint: fingerprintMcp(input),
      credentialLikeFields: credentialLikeFieldNames(input.headers),
      urlClass: input.urlClass ?? "unknown",
    };
  }
  const name = input.name?.trim() || (typeof fp.command === "string" ? fp.command : context.source.relativePath);
  return item(context, "mcp", name, facts, facts.endpointFingerprint);
};