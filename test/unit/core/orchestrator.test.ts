import { describe, expect, it } from "vitest";
import { runAdapters } from "../../../src/core/orchestrator.js";
import type { AgentAdapter } from "../../../src/core/adapter.js";

describe("runAdapters", () => {
  it("isolates adapter failures and emits a cataloged diagnostic", async () => {
    const context = {} as never;
    const healthy: AgentAdapter = { agent: "codex", async scan() { return { agent: "codex", inventory: [], diagnostics: [], coverage: "complete" }; } };
    const broken: AgentAdapter = { agent: "claude", async scan() { throw new Error("secret"); } };
    const results = await runAdapters([broken, healthy], context);
    expect(results[0]).toMatchObject({ agent: "claude", coverage: "unknown", diagnostics: [{ code: "adapter_failed", coverageImpact: "unknown" }] });
    expect(JSON.stringify(results)).not.toContain("secret");
    expect(results[1]).toMatchObject({ agent: "codex", coverage: "complete" });
  });
});
