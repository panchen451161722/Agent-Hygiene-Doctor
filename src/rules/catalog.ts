export interface RuleDefinition { readonly ruleId: string; readonly category: string; readonly defaultSeverity: "info" | "warning" | "error"; readonly title: string; readonly recommendation: string; }
export const RULE_CATALOG: readonly RuleDefinition[] = Object.freeze([
  { ruleId: "skill-metadata-invalid", category: "inventory", defaultSeverity: "warning", title: "Skill metadata is missing or invalid", recommendation: "Provide YAML frontmatter with a non-empty name and description in SKILL.md." },
  { ruleId: "config-invalid", category: "configuration", defaultSeverity: "warning", title: "Invalid configuration", recommendation: "Fix the configuration syntax." },
  { ruleId: "duplicate-active", category: "cross-agent", defaultSeverity: "warning", title: "Duplicate active artifact", recommendation: "Remove or rename duplicate artifacts." },
  { ruleId: "mcp-credential-field", category: "mcp", defaultSeverity: "warning", title: "MCP configuration names credential fields", recommendation: "Store credentials outside the MCP configuration where possible and review field usage." },
  { ruleId: "mcp-package-unpinned", category: "mcp", defaultSeverity: "warning", title: "MCP package invocation is not pinned", recommendation: "Pin the MCP package to an exact version or immutable commit." },
  { ruleId: "mcp-plaintext-remote", category: "mcp", defaultSeverity: "warning", title: "MCP uses plaintext remote HTTP", recommendation: "Use HTTPS for remote MCP endpoints." },
  { ruleId: "mcp-transport-unknown", category: "mcp", defaultSeverity: "warning", title: "MCP transport is unresolved", recommendation: "Provide a supported MCP command or URL configuration." },
  { ruleId: "unresolved-artifact", category: "inventory", defaultSeverity: "warning", title: "Artifact activation is unresolved", recommendation: "Review the referenced artifact." },
]);
export const getRule = (ruleId: string): RuleDefinition | undefined => RULE_CATALOG.find((rule) => rule.ruleId === ruleId);