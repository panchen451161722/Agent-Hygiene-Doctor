import { promises as nodeFs } from "node:fs";

export type FsEntryType = "file" | "directory" | "symlink" | "junction" | "fifo" | "special";

export interface FsStat {
  readonly type: FsEntryType;
  readonly size: number;
  readonly mode?: number;
}

export interface FsFileHandle {
  stat(): Promise<FsStat>;
  read(length: number, position?: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface FsBackend {
  lstat(path: string): Promise<FsStat>;
  realpath(path: string): Promise<string>;
  openRegularFile(path: string): Promise<FsFileHandle>;
  readDirectory(path: string): Promise<readonly string[]>;
}

const mapStats = (s: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; mode: number; size: number }): FsStat => ({
  type: s.isFile() ? "file" : s.isDirectory() ? "directory" : s.isSymbolicLink() ? "symlink" : (s.mode & 0o170000) === 0o010000 ? "fifo" : "special",
  size: s.size,
  mode: s.mode,
});

export const nodeFsBackend: FsBackend = {
  async lstat(path) { return mapStats(await nodeFs.lstat(path)); },
  async realpath(path) { return nodeFs.realpath(path); },
  async openRegularFile(path) {
    const handle = await nodeFs.open(path, "r");
    return {
      async stat() { return mapStats(await handle.stat()); },
      async read(length, position = 0) {
        const buffer = Buffer.alloc(length);
        const result = await handle.read(buffer, 0, length, position);
        return new Uint8Array(buffer.subarray(0, result.bytesRead));
      },
      async close() { await handle.close(); },
    };
  },
  async readDirectory(path) { return nodeFs.readdir(path); },
};
