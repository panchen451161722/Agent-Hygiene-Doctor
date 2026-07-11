import { describe, expect, it } from "vitest";
import { RootRegistry } from "../../../src/core/root-registry.js";
import { win32Dialect } from "../../../src/core/path-dialect.js";

describe("RootRegistry", () => {
  it("renders only a root alias and slash-relative path", () => {
    const roots = RootRegistry.forTest(win32Dialect, [
      { id: "codex-home", alias: "$CODEX_HOME", absolutePath: "C:\\Users\\u\\.codex" },
    ]);
    expect(roots.toSourceRef("codex-home", "C:\\Users\\u\\.codex\\config.toml"))
      .toEqual({ rootId: "codex-home", relativePath: "config.toml" });
    expect(roots.descriptors()).toEqual([
      { id: "codex-home", kind: "external", alias: "$CODEX_HOME" },
    ]);
  });

  it("allows the root itself and rejects sibling escapes", () => {
    const roots = RootRegistry.forTest(win32Dialect, [
      { id: "project", kind: "project", alias: "<project>", absolutePath: "C:\\work\\repo" },
    ]);
    expect(roots.toSourceRef("project", "C:\\work\\repo")).toEqual({ rootId: "project", relativePath: "." });
    expect(() => roots.toSourceRef("project", "C:\\work\\repo-old\\x")).toThrow();
  });

  it("assigns deterministic aliases to external roots after sorting canonical paths", () => {
    const roots = RootRegistry.forTest(win32Dialect, [
      { kind: "external", alias: "external", absolutePath: "C:\\z" },
      { kind: "external", alias: "external", absolutePath: "C:\\a" },
    ]);
    expect(roots.descriptors().map((root) => root.id)).toEqual(["external-1", "external-2"]);
    expect(roots.descriptors().map((root) => root.alias)).toEqual(["external-1", "external-2"]);
  });
});
