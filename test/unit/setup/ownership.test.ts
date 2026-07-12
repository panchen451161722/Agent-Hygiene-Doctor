import { describe, expect, it } from "vitest";
import { createManifest, isManifest } from "../../../src/setup/manifest.js";
import { installOwnedFiles, uninstallOwnedFiles, type OwnedFileSystem } from "../../../src/setup/safe-write.js";

const memoryFs = (): OwnedFileSystem & { files: Map<string, string> } => { const files = new Map<string, string>(); return { files, async readFile(path) { const value = files.get(path); if (value === undefined) throw new Error("ENOENT"); return value; }, async writeFile(path, content) { files.set(path, content); }, async rename(from, to) { files.set(to, files.get(from) ?? ""); files.delete(from); }, async unlink(path) { files.delete(path); } }; };

describe("owned setup lifecycle", () => {
  it("creates a closed manifest and removes only owned files", async () => {
    const fs = memoryFs(); const files = [{ path: "launcher.md", content: "owned" }];
    const manifest = createManifest(files); expect(isManifest(manifest)).toBe(true);
    await installOwnedFiles(fs, files, "manifest.json");
    await uninstallOwnedFiles(fs, manifest);
    expect(fs.files.has("launcher.md")).toBe(false);
    expect(fs.files.has("manifest.json")).toBe(true);
  });
  it("refuses uninstall after owned content changes", async () => {
    const fs = memoryFs(); const files = [{ path: "launcher.md", content: "owned" }]; const manifest = await installOwnedFiles(fs, files, "manifest.json"); fs.files.set("launcher.md", "changed"); await expect(uninstallOwnedFiles(fs, manifest)).rejects.toThrow("AH-SETUP-CONFLICT");
  });
  it("does not treat permission failures as absent destination files", async () => {
    const fs = memoryFs();
    fs.readFile = async () => { const error = Object.assign(new Error("denied"), { code: "EACCES" }); throw error; };
    await expect(installOwnedFiles(fs, [{ path: "launcher.md", content: "owned" }], "manifest.json")).rejects.toThrow("denied");
  });
});
