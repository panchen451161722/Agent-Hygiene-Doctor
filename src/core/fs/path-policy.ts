import type { PathDialect } from "../path-dialect.js";
import type { FsBackend, FsStat } from "./backend.js";

export type PathPolicyErrorCode = "unsafe_reference" | "limit_exceeded" | "not_found";
export class PathPolicyError extends Error {
  constructor(readonly code: PathPolicyErrorCode) { super(`AH-${code}`); this.name = "PathPolicyError"; }
}

export const isContained = (dialect: PathDialect, root: string, candidate: string): boolean => dialect.contains(root, candidate);

export interface AdmittedPath { readonly absolutePath: string; readonly canonicalPath: string; readonly stat: FsStat; }

const isLink = (stat: FsStat): boolean => stat.type === "symlink" || stat.type === "junction";

export const admitPath = async (
  backend: FsBackend, dialect: PathDialect, root: string, candidate: string, maxLinkHops = 8,
): Promise<AdmittedPath> => {
  const rootCanonical = await backend.realpath(root);
  const absolute = dialect.isAbsolute(candidate) ? dialect.normalize(candidate) : dialect.join(root, candidate);
  if (!dialect.contains(root, absolute)) throw new PathPolicyError("unsafe_reference");

  const relative = dialect.relative(root, absolute);
  const parts = relative === "." ? [] : relative.split("/");
  let current = root;
  let stat: FsStat | undefined;
  let hops = 0;

  for (const part of parts) {
    current = dialect.join(current, part);
    stat = await backend.lstat(current);

    while (isLink(stat)) {
      if (++hops > maxLinkHops) throw new PathPolicyError("limit_exceeded");
      const canonical = await backend.realpath(current);
      if (!dialect.contains(rootCanonical, canonical)) throw new PathPolicyError("unsafe_reference");
      current = canonical;
      stat = await backend.lstat(current);
    }
  }

  stat ??= await backend.lstat(current);
  const canonical = await backend.realpath(current);
  if (!dialect.contains(rootCanonical, canonical)) throw new PathPolicyError("unsafe_reference");
  return { absolutePath: current, canonicalPath: canonical, stat };
};