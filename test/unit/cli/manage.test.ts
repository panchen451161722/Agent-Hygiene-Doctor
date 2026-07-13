import { describe, expect, it } from "vitest";

import { runCliAsync } from "../../../src/cli/main.js";

describe("management CLI safety gates", () => {
  it("requires --yes to execute a removal operation", async () => {
    let stdout = "";
    let stderr = "";
    await expect(runCliAsync(["remove", "123e4567-e89b-42d3-a456-426614174000"], { writeStdout: (text) => { stdout += text; }, writeStderr: (text) => { stderr += text; } })).resolves.toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("AH-REMOVE-CONFIRMATION");
  });

  it("requires --yes to restore an operation", async () => {
    let stderr = "";
    await expect(runCliAsync(["restore", "123e4567-e89b-42d3-a456-426614174000"], { writeStdout: () => undefined, writeStderr: (text) => { stderr += text; } })).resolves.toBe(2);
    expect(stderr).toContain("AH-REMOVE-CONFIRMATION");
  });
});
