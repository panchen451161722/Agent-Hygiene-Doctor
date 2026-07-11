import type { PathDialect } from "./path-dialect.js";

export type ProjectMarkerKind = "file" | "directory";

export interface MetadataFileSystem {
  lstat(path: string): Promise<ProjectMarkerKind | null> | ProjectMarkerKind | null;
}

export const findGenericProjectRoot = async (
  selectedWorkingDirectory: string,
  dialect: PathDialect,
  fs: MetadataFileSystem,
): Promise<string> => {
  dialect.assertSafe(selectedWorkingDirectory);
  const selected = dialect.normalize(selectedWorkingDirectory);
  let current = selected;
  while (true) {
    const marker = await fs.lstat(dialect.join(current, ".git"));
    if (marker === "file" || marker === "directory") return current;
    const parent = dialect.dirname(current);
    if (parent === current) return selected;
    current = parent;
  }
};
