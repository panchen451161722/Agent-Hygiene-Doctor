export const manualStepsFor = (ruleId: string): readonly string[] => ruleId === "config-invalid"
  ? ["Open the referenced configuration file.", "Fix syntax errors and rerun doctor."]
  : ruleId === "duplicate-active"
    ? ["Review active artifacts with the same effective name."]
    : ruleId === "mcp-package-unpinned"
      ? ["Replace the package spec with an exact version or commit.", "Rerun doctor to confirm the package is pinned."]
      : ruleId === "mcp-plaintext-remote"
        ? ["Confirm the endpoint supports HTTPS.", "Update the MCP URL and rerun doctor."]
        : ruleId === "mcp-command-not-found"
          ? ["Install the configured command or update the MCP command setting.", "Rerun doctor to verify the command resolves."]
          : ruleId === "mcp-credential-field"
            ? ["Review the named credential field without exposing its value."]
          : ruleId === "mcp-transport-unknown"
            ? ["Specify a supported stdio command or HTTP/SSE URL."]
            : ruleId === "mcp-duplicate-endpoint"
              ? ["Choose one intended active MCP definition and disable or remove duplicates."]
              : [];