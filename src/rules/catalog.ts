export interface RuleDefinition { readonly ruleId: string; readonly category: string; readonly defaultSeverity: "info" | "warning" | "error"; readonly title: string; readonly recommendation: string; }
export const RULE_CATALOG: readonly RuleDefinition[] = Object.freeze([
  { ruleId: "config-invalid", category: "configuration", defaultSeverity: "warning", title: "Invalid configuration", recommendation: "Fix the configuration syntax." },
  { ruleId: "duplicate-active", category: "cross-agent", defaultSeverity: "warning", title: "Duplicate active artifact", recommendation: "Remove or rename duplicate artifacts." },
]);
export const getRule = (ruleId: string): RuleDefinition | undefined => RULE_CATALOG.find((rule) => rule.ruleId === ruleId);