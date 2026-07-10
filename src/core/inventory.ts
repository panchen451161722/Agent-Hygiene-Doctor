import type { AgentId } from "./agent.js";
import type { SourceRef } from "./source-ref.js";

export interface SkillFacts {
  readonly type: "skill";
  readonly effectiveName?: string;
  readonly frontmatter: "valid" | "malformed" | "missing";
  readonly nameUsable: boolean;
  readonly descriptionUsable: boolean;
}

export interface McpFacts {
  readonly type: "mcp";
  readonly transport: "stdio" | "http" | "sse" | "unknown";
  readonly endpointFingerprint?: string;
  readonly commandResolution?: "resolved" | "not-found" | "unknown";
  readonly credentialLikeFields: readonly string[];
  readonly packageInvocation?: "exact" | "unpinned" | "not-applicable" | "unknown";
  readonly urlClass?: "loopback" | "tls" | "plaintext-remote" | "unknown";
}

export interface InstructionFacts {
  readonly type: "instruction";
  readonly byteLength: number;
  readonly normalizedContentFingerprint: string;
  readonly condition: "global" | "path-scoped" | "on-demand" | "unknown";
}

export interface ConfigurationFacts {
  readonly type: "configuration";
  readonly format: "json" | "yaml" | "toml";
  readonly parseStatus: "valid" | "invalid";
  readonly precedence: number;
}

export interface ExtensionFacts {
  readonly type: "extension";
  readonly extensionKind: "rule" | "plugin" | "hook";
  readonly activation: "active" | "disabled" | "candidate" | "unknown";
}

export type InventoryFacts = SkillFacts | McpFacts | InstructionFacts | ConfigurationFacts | ExtensionFacts;

export interface InventoryItem {
  readonly itemId: string;
  readonly agent: AgentId;
  readonly kind: "skill" | "mcp" | "instruction" | "configuration" | "rule" | "plugin" | "hook";
  readonly name: string;
  readonly source: SourceRef;
  readonly scope: "user" | "project" | "managed" | "plugin" | "external";
  readonly status: "active" | "disabled" | "shadowed" | "candidate" | "unresolved";
  readonly loading: "always" | "conditional" | "lazy" | "deferred" | "unknown";
  readonly fingerprint?: string;
  readonly estimatedTokens?: number;
  readonly facts: InventoryFacts;
}
