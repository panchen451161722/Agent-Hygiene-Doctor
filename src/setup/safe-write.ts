import { contentHash, type SetupManifest } from "./manifest.js";

export interface OwnedFileSystem { readFile(path: string): Promise<string>; writeFile(path: string, content: string): Promise<void>; rename(from: string, to: string): Promise<void>; unlink(path: string): Promise<void>; }
export const verifyOwnedContent = (actual: string, expected: string): boolean => actual === expected;
const isMissing = (error: unknown): boolean => error instanceof Error && (error.message === "ENOENT" || ("code" in error && error.code === "ENOENT"));
export const installOwnedFiles = async (fs: OwnedFileSystem, files: readonly { readonly path: string; readonly content: string }[], manifestPath: string): Promise<SetupManifest> => {
  for (const file of files) {
    try {
      const existing = await fs.readFile(file.path);
      if (!verifyOwnedContent(existing, file.content)) throw new Error("AH-SETUP-CONFLICT");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  for (const file of files) {
    const temp = `${file.path}.tmp-agent-hygiene`;
    await fs.writeFile(temp, file.content);
    await fs.rename(temp, file.path);
  }
  const manifest: SetupManifest = { version: 1, files: files.map((file) => ({ path: file.path, sha256: contentHash(file.content) })) };
  const tempManifest = `${manifestPath}.tmp-agent-hygiene`;
  await fs.writeFile(tempManifest, JSON.stringify(manifest));
  await fs.rename(tempManifest, manifestPath);
  return manifest;
};
export const uninstallOwnedFiles = async (fs: OwnedFileSystem, manifest: SetupManifest, manifestPath?: string): Promise<void> => {
  for (const file of manifest.files) {
    const actual = await fs.readFile(file.path);
    if (contentHash(actual) !== file.sha256) throw new Error("AH-SETUP-CONFLICT");
  }
  for (const file of manifest.files) await fs.unlink(file.path);
  if (manifestPath !== undefined) await fs.unlink(manifestPath);
};

