import { describe, expect, it } from "vitest";
import { projectHermesConfig } from "../../src/adapters/hermes/config.js";
import { selectHermesSkills } from "../../src/adapters/hermes/skills.js";
import { projectHermesPlugin } from "../../src/adapters/hermes/plugins.js";

describe("Hermes adapter projections", () => {
  it("projects active profile, sorted MCP names, and external dirs", () => {
    expect(projectHermesConfig({ active_profile: "work", enabled: true, mcp_servers: { z: {}, a: {} }, skills_external_dirs: ["z", "a"] })).toEqual({ activeProfile: "work", enabled: true, mcpServers: ["a", "z"], externalDirs: ["a", "z"] });
  });
  it("keeps local skills ahead of external duplicates", () => {
    expect(selectHermesSkills([{ name: "same", root: "external", enabled: true }, { name: "same", root: "local", enabled: true }, { name: "off", root: "local", enabled: false }]).map((skill) => skill.root)).toEqual(["local", "external"]);
  });
  it("gates project plugins and preserves only safe SOUL text", () => {
    expect(projectHermesPlugin({ name: "p", enabled: true, projectEnabled: false, soul: "safe" })).toEqual({ name: "p", activation: "disabled", soul: "safe" });
  });
});
