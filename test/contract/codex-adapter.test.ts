import { describe, expect, it } from "vitest";
import { projectCodexConfig } from "../../src/adapters/codex/config.js";
import { selectCodexInstructions } from "../../src/adapters/codex/instructions.js";

describe("Codex adapter projections", () => {
  it("clamps project document bytes and sorts markers", () => {
    expect(projectCodexConfig({ project_doc_max_bytes: 999999, project_root_markers: ["z", "a"], trust: "trusted" })).toEqual({ projectRootMarkers: ["a", "z"], projectDocMaxBytes: 32768, trust: "trusted" });
  });
  it("gives override instructions precedence", () => {
    expect(selectCodexInstructions([{ path: "AGENTS.md", kind: "standard", active: true }, { path: "AGENTS.override.md", kind: "override", active: true }]).map((entry) => entry.path)).toEqual(["AGENTS.override.md", "AGENTS.md"]);
  });
});
