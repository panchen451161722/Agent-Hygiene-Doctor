import type { ScanContext } from "../../core/context.js";

export interface PiRoots {
  readonly piHome: string;
  readonly projectRoot: string;
}

export const resolvePiRoots = (context: ScanContext): PiRoots => Object.freeze({
  piHome: context.paths.normalize(context.environment.PI_CODING_AGENT_DIR ?? context.paths.join(context.userHome, ".pi", "agent")),
  projectRoot: context.genericProjectRoot,
});

export const discoverRoots = (context: ScanContext): readonly string[] => {
  const roots = resolvePiRoots(context);
  return Object.freeze([roots.piHome, roots.projectRoot]);
};
