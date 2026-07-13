const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads only the documented per-project trust boolean; all other application state stays unprojected. */
export const hasClaudeProjectMcpApproval = (value: unknown, projectRoot: string): boolean => {
  if (!isRecord(value) || !isRecord(value.projects) || !isRecord(value.projects[projectRoot])) return false;
  return value.projects[projectRoot].hasTrustDialogAccepted === true;
};