import { describe, expect, it } from "vitest";

import { redactOutput, safeEnvironmentName, safeFieldName, safePathReference } from "../../../src/core/redaction.js";

describe("redactOutput", () => {
  it("redacts credential-shaped strings and secret fields", () => {
    const output = redactOutput({ token: "seeded-super-secret", text: "Bearer abcdefghijklmnop" });
    expect(JSON.stringify(output)).not.toContain("seeded-super-secret");
    expect(JSON.stringify(output)).not.toContain("abcdefghijklmnop");
  });

  it("projects conservative allowlisted values", () => {
    expect(safeEnvironmentName("PATH")).toBe("PATH");
    expect(safeEnvironmentName("path-with-secret")).toBeUndefined();
    expect(safeFieldName("project_root")).toBe("project_root");
    expect(safeFieldName("../secret")).toBeUndefined();
    expect(safePathReference("config/settings.json")).toBe("config/settings.json");
    expect(safePathReference("../settings.json")).toBeUndefined();
  });
});
