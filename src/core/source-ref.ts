export interface SourceRef {
  readonly rootId: string;
  readonly relativePath: string;
}

export interface RootDescriptor {
  readonly id: string;
  readonly kind: "project" | "home" | "agent-home" | "managed" | "external";
  readonly alias: string;
}

const WINDOWS_ABSOLUTE = /^[A-Za-z]:\//;

export const assertValidSourceRef = (source: SourceRef): void => {
  if (source.rootId.length === 0) {
    throw new Error("AH-REPORT-INVALID-SOURCE-REF: source paths must be safe slash-separated relative paths");
  }
  const path = source.relativePath;
  if (path === ".") return;
  const segments = path.split("/");
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    WINDOWS_ABSOLUTE.test(path) ||
    path.includes("\\") ||
    segments.some((segment) => segment === ".." || segment === "." || segment === "")
  ) {
    throw new Error("AH-REPORT-INVALID-SOURCE-REF: source paths must be safe slash-separated relative paths");
  }
};

export const compareSourceRefs = (left: SourceRef, right: SourceRef): number =>
  left.rootId.localeCompare(right.rootId, "en") || left.relativePath.localeCompare(right.relativePath, "en");
