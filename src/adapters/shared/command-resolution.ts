import type { ScanContext } from "../../core/context.js";
import type { McpProjection } from "./mcp.js";

type CommandResolution = "resolved" | "not-found" | "unknown";

export const resolveMcpCommands = async (context: ScanContext, projections: readonly McpProjection[]): Promise<readonly McpProjection[]> => {
  const safeFs = context.safeFs;
  if (safeFs === undefined || typeof safeFs.resolveExecutableMetadata !== "function") return projections;
  return Promise.all(projections.map(async (projection) => {
    if (projection.status !== "active" || projection.input.transport !== "stdio" || projection.input.command === undefined) return projection;
    let commandResolution: CommandResolution = "unknown";
    try {
      commandResolution = await safeFs.resolveExecutableMetadata(projection.input.command, {
        platform: context.platform,
        cwd: context.selectedWorkingDirectory,
        path: context.environment?.PATH,
        pathext: context.environment?.PATHEXT,
      });
    } catch {
      commandResolution = "unknown";
    }
    return { ...projection, input: { ...projection.input, commandResolution } };
  }));
};