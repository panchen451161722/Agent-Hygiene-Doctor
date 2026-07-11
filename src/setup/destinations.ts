import type { ScanContext } from "../core/context.js";
export type SetupAgent = "codex" | "claude" | "hermes";
export interface SetupDestination { readonly agent: SetupAgent; readonly directory: string; readonly skillPath: string; readonly manifestPath: string; }
export const setupDestinations = Object.freeze(["codex", "claude", "hermes"] as const);
export const resolveSetupDestination = (agent: SetupAgent, context: ScanContext): SetupDestination => {
  const home = agent === "codex" ? context.paths.join(context.userHome, ".agents", "skills", "agent-hygiene") : agent === "claude" ? context.paths.join(context.environment.CLAUDE_CONFIG_DIR ?? context.paths.join(context.userHome, ".claude"), "skills", "agent-hygiene") : context.paths.join(context.environment.HERMES_HOME ?? context.paths.join(context.userHome, ".hermes"), "skills", "agent-hygiene");
  return { agent, directory: home, skillPath: context.paths.join(home, "SKILL.md"), manifestPath: context.paths.join(home, "manifest.json") };
};
