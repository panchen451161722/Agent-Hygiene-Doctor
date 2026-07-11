import { describe, expect, it } from "vitest";
import { SafeFileSystem, type AdmittedRoot } from "../../src/core/fs/safe-fs.js";
import { ScanIoSemaphore } from "../../src/core/fs/semaphore.js";
import { posixDialect } from "../../src/core/path-dialect.js";
import { SCAN_LIMITS_V1 } from "../../src/core/limits.js";
import type { FsBackend, FsFileHandle, FsStat } from "../../src/core/fs/backend.js";

const admitRoot = async (safeFs: SafeFileSystem, rootPath = "/root"): Promise<AdmittedRoot> => {
  const result = await safeFs.admitRoot(rootPath);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("root admission failed");
  return result.root;
};

describe("SafeFileSystem", () => {
  it("reads maxFileBytes + 1 and discards overflow", async () => {
    let bytesRead = 0;
    const stat: FsStat = { type: "file", size: 1 };
    const backend: FsBackend = { lstat: async (path) => path === "/root" ? { type: "directory", size: 0 } : stat, realpath: async (p) => p, readDirectory: async () => [], openRegularFile: async () => ({ stat: async () => stat, read: async (n) => { bytesRead += n; return new Uint8Array(n); }, close: async () => undefined }) };
    const safeFs = new SafeFileSystem({ backend, dialect: posixDialect });
    const root = await admitRoot(safeFs);
    const result = await safeFs.readText(root, "file");
    expect(result).toMatchObject({ ok: false, diagnostic: { code: "limit_exceeded" } });
    expect(bytesRead).toBe(SCAN_LIMITS_V1.maxFileBytes + 1);
  });

  it("sorts directory entries and caps concurrent operations", async () => {
    let peak = 0; let active = 0;
    const backend: FsBackend = { lstat: async () => ({ type: "directory", size: 0 }), realpath: async (p) => p, openRegularFile: async () => { throw new Error(); }, readDirectory: async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 1)); active--; return ["b", "a"]; } };
    const safeFs = new SafeFileSystem({ backend, dialect: posixDialect, semaphore: new ScanIoSemaphore(8) });
    const root = await admitRoot(safeFs);
    expect(await safeFs.readDirectory(root)).toMatchObject({ ok: true, entries: ["a", "b"] });
    expect(peak).toBeLessThanOrEqual(8);
  });

  it("guards metadata operations with the shared semaphore", async () => {
    let peak = 0; let active = 0;
    const enter = async <T>(value: T): Promise<T> => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return value;
    };
    const backend: FsBackend = {
      lstat: async () => enter({ type: "directory", size: 0 }),
      realpath: async (path) => enter(path),
      openRegularFile: async () => { throw new Error(); },
      readDirectory: async () => enter([]),
    };
    const safeFs = new SafeFileSystem({ backend, dialect: posixDialect, semaphore: new ScanIoSemaphore(1) });
    const root = await admitRoot(safeFs);
    await Promise.all(Array.from({ length: 8 }, () => safeFs.readDirectory(root)));
    expect(peak).toBe(1);
  });

  it("rejects a file handle that is no longer regular after opening", async () => {
    const stat: FsStat = { type: "file", size: 1 };
    let closed = false;
    const handle: FsFileHandle = {
      stat: async () => ({ type: "fifo", size: 0 }),
      read: async () => new Uint8Array([1]),
      close: async () => { closed = true; },
    };
    const backend: FsBackend = {
      lstat: async (path) => path === "/root" ? { type: "directory", size: 0 } : stat,
      realpath: async (path) => path,
      openRegularFile: async () => handle,
      readDirectory: async () => [],
    };
    const safeFs = new SafeFileSystem({ backend, dialect: posixDialect });
    const root = await admitRoot(safeFs);
    const result = await safeFs.readText(root, "file");
    expect(result).toMatchObject({ ok: false, diagnostic: { code: "special_file" } });
    expect(closed).toBe(true);
  });

  it("keeps root budgets across calls", async () => {
    const stat: FsStat = { type: "file", size: 0 };
    const backend: FsBackend = {
      lstat: async (path) => path === "/root" ? { type: "directory", size: 0 } : stat,
      realpath: async (path) => path,
      openRegularFile: async () => ({ stat: async () => stat, read: async () => new Uint8Array(), close: async () => undefined }),
      readDirectory: async () => [],
    };
    const safeFs = new SafeFileSystem({ backend, dialect: posixDialect, limits: { ...SCAN_LIMITS_V1, maxFilesPerRoot: 1 } });
    const root = await admitRoot(safeFs);
    expect(await safeFs.readText(root, "one")).toMatchObject({ ok: true });
    expect(await safeFs.readText(root, "two")).toMatchObject({ ok: false, diagnostic: { code: "limit_exceeded" } });
  });

  it("limits admitted roots per adapter", async () => {
    const backend: FsBackend = {
      lstat: async () => ({ type: "directory", size: 0 }),
      realpath: async (path) => path,
      openRegularFile: async () => { throw new Error(); },
      readDirectory: async () => [],
    };
    const safeFs = new SafeFileSystem({ backend, dialect: posixDialect, limits: { ...SCAN_LIMITS_V1, maxRootsPerAdapter: 1 } });
    expect(await safeFs.admitRoot("/root-a")).toMatchObject({ ok: true });
    expect(await safeFs.admitRoot("/root-b")).toMatchObject({ ok: false, diagnostic: { code: "limit_exceeded" } });
  });
});