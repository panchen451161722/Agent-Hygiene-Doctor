import { describe, expect, it } from "vitest";
import { recognizePackageInvocation } from "../../../src/rules/package-spec.js";

describe("package runner recognition", () => {
  it.each([
    ["npx", ["-y", "demo@1.2.3"], "exact"],
    ["npx", ["-y", "@modelcontextprotocol/server-github@1.2.3"], "exact"],
    ["npm", ["exec", "--", "demo@0123456789012345678901234567890123456789"], "exact"],
    ["pnpm", ["dlx", "demo@latest"], "unpinned"],
    ["yarn", ["dlx", "demo@^1.0.0"], "unpinned"],
    ["bunx", ["demo"], "unpinned"],
  ])("classifies %s", (command, args, pin) => {
    expect(recognizePackageInvocation(command, args)).toMatchObject({ pin });
  });
});
