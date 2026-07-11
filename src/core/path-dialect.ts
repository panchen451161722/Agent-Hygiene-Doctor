import posix from "node:path/posix";
import win32 from "node:path/win32";

export type PathDialectPlatform = "posix" | "win32";

export class UnsafePathError extends Error {
  constructor(detail = "path is not safe") {
    super(`AH-UNSAFE-PATH: ${detail}`);
    this.name = "UnsafePathError";
  }
}

export interface PathDialect {
  readonly platform: PathDialectPlatform;
  readonly separator: string;
  assertSafe(path: string): void;
  isAbsolute(path: string): boolean;
  normalize(path: string): string;
  resolve(...paths: string[]): string;
  dirname(path: string): string;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  contains(root: string, candidate: string): boolean;
  compare(left: string, right: string): number;
  toSlash(path: string): string;
}

type NodePath = typeof posix;

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

class NodePathDialect implements PathDialect {
  readonly separator: string;
  private readonly caseInsensitive: boolean;
  private readonly path: NodePath;

  constructor(readonly platform: PathDialectPlatform) {
    this.path = platform === "win32" ? win32 : posix;
    this.separator = this.path.sep;
    this.caseInsensitive = platform === "win32";
  }

  assertSafe(value: string): void {
    if (value.includes("\u0000")) throw new UnsafePathError("NUL is forbidden");
    if (this.platform === "win32") {
      const normalized = value.replaceAll("/", "\\");
      if (/^(?:\\\\[.?]\\|\\\\\\?\\)/u.test(normalized)) {
        throw new UnsafePathError("device namespaces are forbidden");
      }
      if (/^[A-Za-z]:[^\\/]/u.test(normalized)) {
        throw new UnsafePathError("drive-relative paths are forbidden");
      }
      if (!/^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)/u.test(normalized)) {
        throw new UnsafePathError("fully qualified Windows paths are required");
      }
      const segments = normalized.split(/[\\/]/u);
      if (segments.slice(1).some((segment) => segment.includes(":"))) {
        throw new UnsafePathError("alternate data streams are forbidden");
      }
      if (this.path.isAbsolute(normalized) && normalized.startsWith("\\\\")) {
        const parts = normalized.split("\\").filter(Boolean);
        if (parts.length < 2) throw new UnsafePathError("incomplete UNC root");
      }
    } else if (!this.path.isAbsolute(value)) {
      throw new UnsafePathError("absolute paths are required");
    }
  }

  isAbsolute(value: string): boolean {
    return this.path.isAbsolute(value);
  }

  normalize(value: string): string {
    this.assertSafe(value);
    return this.path.normalize(value);
  }

  resolve(...values: string[]): string {
    values.forEach((value) => this.assertSafe(value));
    const result = this.path.resolve(...values);
    this.assertSafe(result);
    return result;
  }

  dirname(value: string): string {
    this.assertSafe(value);
    return this.path.dirname(value);
  }

  join(...values: string[]): string {
    const result = this.path.join(...values);
    this.assertSafe(result);
    return result;
  }

  relative(from: string, to: string): string {
    this.assertSafe(from);
    this.assertSafe(to);
    const relative = this.path.relative(from, to);
    if (relative === "") return ".";
    const slashRelative = relative.replaceAll("\\", "/");
    if (slashRelative === ".." || slashRelative.startsWith("../") || this.path.isAbsolute(relative)) {
      throw new UnsafePathError("path is outside the root");
    }
    return slashRelative;
  }

  contains(root: string, candidate: string): boolean {
    try {
      this.assertSafe(root);
      this.assertSafe(candidate);
      const rootNormalized = this.path.normalize(root);
      const candidateNormalized = this.path.normalize(candidate);
      const rootKey = this.comparisonKey(rootNormalized);
      const candidateKey = this.comparisonKey(candidateNormalized);
      if (this.rootKey(rootKey) !== this.rootKey(candidateKey)) return false;
      const relative = this.path.relative(rootNormalized, candidateNormalized);
      const slashRelative = relative.replaceAll("\\", "/");
      return slashRelative === "" || (slashRelative !== ".." && !slashRelative.startsWith("../") && !this.path.isAbsolute(relative));
    } catch (error) {
      if (error instanceof UnsafePathError) return false;
      throw error;
    }
  }

  compare(left: string, right: string): number {
    const leftKey = this.comparisonKey(this.normalize(left));
    const rightKey = this.comparisonKey(this.normalize(right));
    return compareText(leftKey, rightKey);
  }

  toSlash(value: string): string {
    this.assertSafe(value);
    return value.replaceAll("\\", "/");
  }

  private comparisonKey(value: string): string {
    const slash = value.replaceAll("\\", "/");
    return this.caseInsensitive ? slash.toLocaleLowerCase("en-US") : slash;
  }

  private rootKey(value: string): string {
    if (this.platform === "posix") return "/";
    if (value.startsWith("//")) {
      const [host, share] = value.slice(2).split("/");
      return `//${host ?? ""}/${share ?? ""}`;
    }
    return value.slice(0, 2);
  }
}

export const posixDialect: PathDialect = Object.freeze(new NodePathDialect("posix"));
export const win32Dialect: PathDialect = Object.freeze(new NodePathDialect("win32"));

export const createPathDialect = (platform: "win32" | "darwin" | "linux"): PathDialect =>
  platform === "win32" ? win32Dialect : posixDialect;
