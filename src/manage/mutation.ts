import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { RemovalError } from "./model.js";

const MAX_DEPTH = 24;
const MAX_FILES = 10_000;
const MAX_BYTES = 64 * 1024 * 1024;

const hash = (chunks: readonly (string | Uint8Array)[]): string => {
  const value = createHash("sha256");
  for (const chunk of chunks) value.update(chunk);
  return value.digest("hex");
};
const reject = (): never => { throw new RemovalError("AH-REMOVE-REFUSED"); };
const under = (root: string, target: string): boolean => {
  const result = relative(resolve(root), resolve(target));
  return result === "" || (!result.startsWith("..") && !result.includes("..\\") && !result.includes("../"));
};

export const assertRegularFile = async (path: string): Promise<void> => {
  const stat = await fs.lstat(path).catch(() => undefined);
  if (stat === undefined || !stat.isFile() || stat.isSymbolicLink()) reject();
};

export const assertContained = (root: string, target: string): void => {
  if (!under(root, target) || resolve(root) === resolve(target)) reject();
};

export const hashFile = async (path: string): Promise<string> => {
  await assertRegularFile(path);
  return hash([await fs.readFile(path)]);
};

interface TreeAccounting { files: number; bytes: number; }
const hashDirectoryInner = async (path: string, root: string, accounting: TreeAccounting, depth: number, output: Array<string | Uint8Array>): Promise<void> => {
  if (depth > MAX_DEPTH) reject();
  const entries = await fs.readdir(path, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const absolute = join(path, entry.name);
    const stat = await fs.lstat(absolute);
    const name = relative(root, absolute).replaceAll("\\", "/");
    if (stat.isSymbolicLink() || !(stat.isFile() || stat.isDirectory())) reject();
    if (stat.isDirectory()) { output.push(`D:${name}\n`); await hashDirectoryInner(absolute, root, accounting, depth + 1, output); continue; }
    accounting.files += 1;
    accounting.bytes += stat.size;
    if (accounting.files > MAX_FILES || accounting.bytes > MAX_BYTES) reject();
    output.push(`F:${name}:${stat.size}\n`, await fs.readFile(absolute));
  }
};

export const hashDirectory = async (path: string): Promise<string> => {
  const stat = await fs.lstat(path).catch(() => undefined);
  if (stat === undefined || !stat.isDirectory() || stat.isSymbolicLink()) reject();
  const output: Array<string | Uint8Array> = ["agent-hygiene-directory-v1\n"];
  await hashDirectoryInner(path, path, { files: 0, bytes: 0 }, 0, output);
  return hash(output);
};

export const copyDirectoryChecked = async (source: string, destination: string): Promise<void> => {
  await hashDirectory(source);
  await fs.mkdir(destination, { recursive: false, mode: 0o700 });
  const copy = async (from: string, to: string): Promise<void> => {
    const entries = await fs.readdir(from, { withFileTypes: true });
    for (const entry of entries) {
      const fromPath = join(from, entry.name);
      const toPath = join(to, entry.name);
      const stat = await fs.lstat(fromPath);
      if (stat.isSymbolicLink() || !(stat.isFile() || stat.isDirectory())) reject();
      if (stat.isDirectory()) { await fs.mkdir(toPath, { mode: 0o700 }); await copy(fromPath, toPath); }
      else { await fs.copyFile(fromPath, toPath); await fs.chmod(toPath, 0o600).catch(() => undefined); }
    }
  };
  await copy(source, destination);
  if (await hashDirectory(destination) !== await hashDirectory(source)) throw new RemovalError("AH-REMOVE-REFUSED");
};

export const removeDirectoryChecked = async (path: string): Promise<void> => {
  await hashDirectory(path);
  const remove = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const target = join(current, entry.name);
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || !(stat.isFile() || stat.isDirectory())) reject();
      if (stat.isDirectory()) { await remove(target); await fs.rmdir(target); } else await fs.unlink(target);
    }
  };
  await remove(path);
  await fs.rmdir(path);
};

export const writeAtomic = async (path: string, content: Uint8Array): Promise<void> => {
  await assertRegularFile(path);
  const temporary = join(dirname(path), `.${basename(path)}.agent-hygiene-${process.pid}-${Date.now()}.tmp`);
  await fs.writeFile(temporary, content, { mode: 0o600, flag: "wx" });
  try { await fs.rename(temporary, path); }
  catch (error) { await fs.unlink(temporary).catch(() => undefined); throw error; }
};

export const assertNoLinksAlongPath = async (root: string, target: string): Promise<void> => {
  if (!under(root, target)) reject();
  let current = resolve(root);
  const rootStat = await fs.lstat(current).catch(() => undefined);
  if (rootStat === undefined || rootStat.isSymbolicLink()) reject();
  const segments = relative(current, resolve(target)).split(/[\\/]/u).filter((segment) => segment.length > 0);
  for (const segment of segments) {
    current = join(current, segment);
    const stat = await fs.lstat(current).catch(() => undefined);
    if (stat === undefined || stat.isSymbolicLink()) reject();
  }
};