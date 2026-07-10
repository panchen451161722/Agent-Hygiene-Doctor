export const AGENT_IDS = ["codex", "claude", "hermes"] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export const compareAgents = (left: AgentId, right: AgentId): number =>
  AGENT_IDS.indexOf(left) - AGENT_IDS.indexOf(right);
