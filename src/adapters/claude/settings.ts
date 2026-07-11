export interface ClaudeSettingsProjection { readonly precedence: readonly string[]; readonly managed: boolean; readonly mcpEnabled: boolean; readonly unresolved: boolean; }
export const projectClaudeSettings = (sources: readonly { name: string; managed?: boolean; mcp?: boolean; readable?: boolean }[]): ClaudeSettingsProjection => {
  const sorted = [...sources].sort((left, right) => Number(Boolean(right.managed)) - Number(Boolean(left.managed)) || left.name.localeCompare(right.name, "en"));
  return Object.freeze({ precedence: Object.freeze(sorted.map((source) => source.name)), managed: sorted.some((source) => source.managed === true), mcpEnabled: sorted.some((source) => source.mcp === true), unresolved: sorted.some((source) => source.readable === false) });
};
