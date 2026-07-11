import type { ScanContext } from "../../core/context.js";
export const discoverRoots = (context: ScanContext): readonly string[] => [context.genericProjectRoot, context.userHome];