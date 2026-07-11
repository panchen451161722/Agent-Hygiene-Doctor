import type { RootDescriptor, SourceRef } from "./source-ref.js";
import type { PathDialect } from "./path-dialect.js";

export interface RootRegistration {
  readonly id?: string;
  readonly kind?: RootDescriptor["kind"];
  readonly alias?: string;
  readonly absolutePath: string;
}

interface RegisteredRoot extends RootDescriptor {
  readonly absolutePath: string;
}

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

export class RootRegistry {
  private readonly roots: ReadonlyMap<string, RegisteredRoot>;

  private constructor(private readonly dialect: PathDialect, registrations: readonly RootRegistration[]) {
    const values = registrations.map((registration) => {
      const kind = registration.kind ?? "external";
      const isExternal = kind === "external";
      const id = registration.id ?? (isExternal ? "" : kind);
      const alias = registration.alias ?? id;
      return {
        id,
        kind,
        alias,
        absolutePath: dialect.normalize(registration.absolutePath),
      } satisfies RegisteredRoot;
    });
    const canonicalExternal = values.filter((value) => value.kind === "external")
      .sort((left, right) => dialect.compare(left.absolutePath, right.absolutePath));
    for (let index = 1; index < canonicalExternal.length; index += 1) {
      if (dialect.compare(canonicalExternal[index - 1]!.absolutePath, canonicalExternal[index]!.absolutePath) === 0) {
        throw new Error("AH-DUPLICATE-ROOT: canonical external roots must be unique");
      }
    }
    const externalValues = canonicalExternal.filter((value) => value.id === "");
    externalValues.forEach((value, index) => {
      const id = `external-${index + 1}`;
      (value as { id: string }).id = id;
      (value as { alias: string }).alias = id;
    });
    if (new Set(values.map((value) => value.id)).size !== values.length) {
      throw new Error("AH-DUPLICATE-ROOT: root ids must be unique");
    }
    this.roots = new Map(values.map((root) => [root.id, root]));
  }

  static forTest(dialect: PathDialect, registrations: readonly RootRegistration[]): RootRegistry {
    return new RootRegistry(dialect, registrations);
  }

  static create(dialect: PathDialect, registrations: readonly RootRegistration[]): RootRegistry {
    return new RootRegistry(dialect, registrations);
  }

  descriptors(): readonly RootDescriptor[] {
    return [...this.roots.values()]
      .sort((left, right) => compareText(left.id, right.id))
      .map(({ id, kind, alias }) => ({ id, kind, alias }));
  }

  toSourceRef(rootId: string, absolutePath: string): SourceRef {
    const root = this.roots.get(rootId);
    if (root === undefined) throw new Error("AH-UNKNOWN-ROOT: root id is not registered");
    if (!this.dialect.contains(root.absolutePath, absolutePath)) {
      throw new Error("AH-UNSAFE-PATH: path is outside the admitted root");
    }
    return { rootId, relativePath: this.dialect.relative(root.absolutePath, absolutePath) };
  }

  contains(rootId: string, absolutePath: string): boolean {
    const root = this.roots.get(rootId);
    return root !== undefined && this.dialect.contains(root.absolutePath, absolutePath);
  }

  getAbsolutePathForScan(rootId: string): string {
    const root = this.roots.get(rootId);
    if (root === undefined) throw new Error("AH-UNKNOWN-ROOT: root id is not registered");
    return root.absolutePath;
  }
}
