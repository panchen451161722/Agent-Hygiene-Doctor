import { describe, expect, it } from "vitest";
import { fingerprintInput, fingerprintMcp, credentialLikeFieldNames } from "../../../src/rules/mcp-fingerprint.js";

describe("MCP fingerprint", () => {
  it("discards URL query values and userinfo", () => {
    const alpha = { transport: "http" as const, url: "https://user:secret@example.com/api?a=alpha" };
    const beta = { transport: "http" as const, url: "https://other:secret@example.com/api?a=beta" };
    expect(fingerprintMcp(alpha)).toBe(fingerprintMcp(beta));
    expect(JSON.stringify(fingerprintInput(alpha))).not.toContain("alpha");
    expect(JSON.stringify(fingerprintInput(alpha))).not.toContain("secret");
  });

  it("keeps only safe environment names and identifies credential keys", () => {
    const safe = fingerprintInput({ transport: "stdio", command: "npx", args: ["-y", "demo@1.2.3"], env: { API_TOKEN: "secret", MODE: "prod" } });
    expect(JSON.stringify(safe)).not.toContain("secret");
    expect(credentialLikeFieldNames({ token: "secret", mode: "prod", authorization: "${TOKEN}" })).toEqual(["authorization", "token"]);
  });
});
