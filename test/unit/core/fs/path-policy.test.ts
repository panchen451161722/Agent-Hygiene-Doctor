import { describe, expect, it } from "vitest";
import { posixDialect, win32Dialect } from "../../../../src/core/path-dialect.js";
import { admitPath } from "../../../../src/core/fs/path-policy.js";
import type { FsBackend, FsFileHandle, FsStat } from "../../../../src/core/fs/backend.js";

const file: FsStat = { type: "file", size: 1 };
const handle: FsFileHandle = { stat: async () => file, read: async () => new Uint8Array(), close: async () => undefined };
const backend = (stats: Record<string, FsStat>, paths: Record<string, string> = {}): FsBackend => ({
  lstat: async (path) => stats[path] ?? file,
  realpath: async (path) => paths[path] ?? path,
  openRegularFile: async () => handle,
  readDirectory: async () => [],
});

describe("path policy", () => {
  it("rejects sibling-prefix and ancestor symlink escapes", async () => {
    await expect(admitPath(backend({ "/root/link": { type: "symlink", size: 0 }, "/root/link/file": file }, { "/root": "/root", "/root/link": "/outside" }), posixDialect, "/root", "link/file"))
      .rejects.toThrow();

    await expect(admitPath(backend({}), posixDialect, "/root", "../root-evil/x")).rejects.toThrow();
    await expect(admitPath(backend({ "/root/link": { type: "symlink", size: 0 } }, { "/root": "/root", "/root/link": "/outside" }), posixDialect, "/root", "link")).rejects.toThrow();
  });
  it("allows an in-root link and rejects fake Windows junction", async () => {
    await expect(admitPath(backend({ "/root/link": { type: "symlink", size: 0 } }, { "/root": "/root", "/root/link": "/root/file" }), posixDialect, "/root", "link")).resolves.toMatchObject({ canonicalPath: "/root/file" });
    await expect(admitPath(backend({ "C:\\root\\j": { type: "junction", size: 0 } }, { "C:\\root": "C:\\root", "C:\\root\\j": "C:\\evil" }), win32Dialect, "C:\\root", "j")).rejects.toThrow();
  });
});
