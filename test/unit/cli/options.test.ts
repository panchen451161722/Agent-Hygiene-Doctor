import { describe, expect, it } from "vitest";
import { parseCliOptions } from "../../../src/cli/options.js";

describe("parseCliOptions", () => {
  it("turns agent mode into non-interactive JSON", () => {
    expect(parseCliOptions(["doctor", "--agent-mode"])).toMatchObject({
      command: "doctor",
      format: "json",
      interactive: false,
      color: false,
    });
  });

  it("rejects an unsupported agent", () => {
    expect(() => parseCliOptions(["doctor", "--agent", "cursor"]))
      .toThrowError("AH-CLI-INVALID-AGENT");
  });
});
