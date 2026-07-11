import type { ScanContext } from "../../core/context.js";

export interface CodexRoots { readonly codexHome: string; readonly projectRoot: string; readonly projectChain: readonly string[]; }

export const resolveCodexRoots = (context: ScanContext): CodexRoots => {
  const codexHome = context.paths.normalize(context.environment.CODEX_HOME ?? context.paths.join(context.userHome, ".codex"));
  const projectRoot = context.genericProjectRoot as string;
  const chain: string[] = [];
  let current = projectRoot;
  for (;;) {
    chain.unshift(current);
    const parent = context.paths.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return Object.freeze({ codexHome, projectRoot, projectChain: Object.freeze(chain) });
};

export const discoverRoots = (context: ScanContext): readonly string[] => {
  const roots = resolveCodexRoots(context);
  return Object.freeze([roots.codexHome, ...roots.projectChain]);
};

