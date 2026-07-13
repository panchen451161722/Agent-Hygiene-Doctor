const environmentReference = /\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/u;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const containsEnvironmentReference = (value: unknown): boolean => typeof value === "string"
  ? environmentReference.test(value)
  : Array.isArray(value)
    ? value.some(containsEnvironmentReference)
    : isRecord(value)
      ? Object.values(value).some(containsEnvironmentReference)
      : false;

/** Environment-dependent server settings stay unresolved because doctor never reads or sources .env. */
export const hermesMcpDependsOnEnvironment = (config: unknown, name: string): boolean =>
  isRecord(config) && isRecord(config.mcp_servers) && containsEnvironmentReference(config.mcp_servers[name]);