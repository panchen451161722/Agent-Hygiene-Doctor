import { describe, expect, it } from "vitest";
import { createScanContext } from "../../../src/core/context.js";
import { posixDialect } from "../../../src/core/path-dialect.js";
import { resolveSetupDestination } from "../../../src/setup/destinations.js";
import { renderLauncher } from "../../../src/setup/launcher.js";

describe("setup destinations", () => {
  it("uses agent-specific directories and explicit environment overrides", async () => {
    const context = await createScanContext({ platform: "linux", paths: posixDialect, selectedWorkingDirectory: "/repo", projectRoot: "/repo", environment: { HOME: "/home/a", CLAUDE_CONFIG_DIR: "/cfg", HERMES_HOME: "/hermes" }, fs: { lstat: async () => "directory" as const }, toolVersion: "0.1.0" });
    expect(resolveSetupDestination("codex", context).skillPath).toBe("/home/a/.agents/skills/agent-hygiene/SKILL.md");
    expect(resolveSetupDestination("claude", context).skillPath).toBe("/cfg/skills/agent-hygiene/SKILL.md");
    expect(resolveSetupDestination("hermes", context).skillPath).toBe("/hermes/skills/agent-hygiene/SKILL.md");
  });
  it("pins the package version in the launcher", () => { expect(renderLauncher("0.1.0")).toContain("npx -y agent-hygiene-cli@0.1.0 doctor --agent-mode"); });
});


