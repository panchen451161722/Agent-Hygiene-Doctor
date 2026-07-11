import { TextDecoder } from "node:util";
import { SCAN_LIMITS_V1 } from "../limits.js";
import type { FsBackend, FsStat } from "./backend.js";
import { admitPath, PathPolicyError } from "./path-policy.js";
import { AdapterBudget, RootBudget } from "./budget.js";
import { ScanIoSemaphore } from "./semaphore.js";
import type { PathDialect } from "../path-dialect.js";
import type { RootRegistry } from "../root-registry.js";

const admittedRootBrand: unique symbol = Symbol("agent-hygiene-admitted-root");

export interface AdmittedRoot {
  readonly absolutePath: string;
  readonly canonicalPath: string;
  readonly [admittedRootBrand]: true;
}
export type SafeDiagnosticCode = "limit_exceeded" | "unsafe_reference" | "special_file" | "not_found";
export interface SafeReadResult { readonly ok: false; readonly diagnostic: { readonly code: SafeDiagnosticCode; }; }
export interface SafeTextResult { readonly ok: true; readonly text: string; }
export interface SafeRootResult { readonly ok: true; readonly root: AdmittedRoot; }
export interface SafeDirectoryResult { readonly ok: true; readonly entries: readonly string[]; }
export interface SafeFsOptions { readonly backend: FsBackend; readonly dialect: PathDialect; readonly semaphore?: ScanIoSemaphore; readonly limits?: typeof SCAN_LIMITS_V1; readonly adapterBudget?: AdapterBudget; readonly rootRegistry?: RootRegistry; }

const diagnostic = (code: SafeDiagnosticCode): SafeReadResult => ({ ok: false, diagnostic: { code } });
const nonFileDiagnostic = (stat: FsStat): SafeReadResult =>
  diagnostic(stat.type === "fifo" || stat.type === "special" ? "special_file" : "unsafe_reference");

export class SafeFileSystem {
  readonly semaphore: ScanIoSemaphore;
  readonly adapterBudget: AdapterBudget;
  private readonly rootBudgets = new WeakMap<AdmittedRoot, RootBudget>();
  private readonly knownRoots = new WeakSet<AdmittedRoot>();

  constructor(private readonly options: SafeFsOptions) {
    const limits = options.limits ?? SCAN_LIMITS_V1;
    this.semaphore = options.semaphore ?? new ScanIoSemaphore(limits.maxConcurrentFsOps);
    this.adapterBudget = options.adapterBudget ?? new AdapterBudget({ roots: limits.maxRootsPerAdapter, artifacts: limits.maxArtifactsPerAdapter });
  }

  async admitRoot(rootPath: string): Promise<SafeRootResult | SafeReadResult> {
    const backend = this.guardedBackend();
    try {
      const registeredPath = this.options.rootRegistry?.getAbsolutePathForScan(rootPath) ?? rootPath;
      const absolute = this.options.dialect.normalize(registeredPath);
      const stat = await backend.lstat(absolute);
      if (stat.type !== "directory") return nonFileDiagnostic(stat);
      const canonical = await backend.realpath(absolute);
      if (!this.adapterBudget.spend("roots")) return diagnostic("limit_exceeded");
      const root: AdmittedRoot = Object.freeze({ absolutePath: absolute, canonicalPath: canonical, [admittedRootBrand]: true as const });
      this.knownRoots.add(root);
      this.rootBudgets.set(root, this.createRootBudget());
      return { ok: true, root };
    } catch {
      return diagnostic("unsafe_reference");
    }
  }
  private createRootBudget(): RootBudget {
    const limits = this.options.limits ?? SCAN_LIMITS_V1;
    return new RootBudget({
      files: limits.maxFilesPerRoot,
      bytes: limits.maxBytesPerRoot,
      depth: limits.maxDirectoryDepth,
      entries: limits.maxEntriesPerDirectory,
    });
  }

  private isKnownRoot(root: AdmittedRoot): boolean {
    return Boolean(root?.[admittedRootBrand]) && this.knownRoots.has(root);
  }

  private budgetFor(root: AdmittedRoot): RootBudget | undefined {
    return this.rootBudgets.get(root);
  }

  private guardedBackend(): FsBackend {
    const backend = this.options.backend;
    const semaphore = this.semaphore;
    return {
      lstat: (path) => semaphore.run(() => backend.lstat(path)),
      realpath: (path) => semaphore.run(() => backend.realpath(path)),
      readDirectory: (path) => semaphore.run(() => backend.readDirectory(path)),
      openRegularFile: async (path) => {
        const handle = await semaphore.run(() => backend.openRegularFile(path));
        return {
          stat: () => semaphore.run(() => handle.stat()),
          read: (length, position) => semaphore.run(() => handle.read(length, position)),
          close: () => semaphore.run(() => handle.close()),
        };
      },
    };
  }

  async readText(root: AdmittedRoot, relativePath: string): Promise<SafeTextResult | SafeReadResult> {
    const budget = this.budgetFor(root);
    if (!this.isKnownRoot(root) || !budget) return diagnostic("unsafe_reference");
    if (!this.adapterBudget.spend("artifacts")) return diagnostic("limit_exceeded");
    const backend = this.guardedBackend();
    let admitted;
    try { admitted = await admitPath(backend, this.options.dialect, root.canonicalPath, relativePath, this.options.limits?.maxLinkHops ?? SCAN_LIMITS_V1.maxLinkHops); }
    catch (error) {
      if (error instanceof PathPolicyError && error.code === "limit_exceeded") return diagnostic("limit_exceeded");
      return diagnostic(error instanceof PathPolicyError ? "unsafe_reference" : "not_found");
    }
    if (admitted.stat.type !== "file") return nonFileDiagnostic(admitted.stat);
    if (!budget.spend("files")) return diagnostic("limit_exceeded");
    let handle;
    try { handle = await backend.openRegularFile(admitted.canonicalPath); }
    catch { return diagnostic("not_found"); }
    try {
      const openedStat = await handle.stat();
      if (openedStat.type !== "file") return nonFileDiagnostic(openedStat);
      const max = this.options.limits?.maxFileBytes ?? SCAN_LIMITS_V1.maxFileBytes;
      const chunks: Uint8Array[] = []; let position = 0; let total = 0;
      for (;;) {
        const remainingRootBytes = budget.remaining("bytes");
        if (remainingRootBytes <= 0) return diagnostic("limit_exceeded");
        const length = Math.min(64 * 1024, max + 1 - total, remainingRootBytes);
        const chunk = await handle.read(length, position);
        if (chunk.byteLength === 0) break;
        chunks.push(chunk); total += chunk.byteLength; position += chunk.byteLength;
        if (total >= max + 1) return diagnostic("limit_exceeded");
        if (!budget.spend("bytes", chunk.byteLength)) return diagnostic("limit_exceeded");
      }
      const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { ok: true, text: new TextDecoder("utf-8", { fatal: false }).decode(bytes) };
    } catch {
      return diagnostic("not_found");
    } finally {
      try { await handle.close(); } catch { /* ignore close failures after safe diagnostic mapping */ }
    }
  }

  async readDirectory(root: AdmittedRoot, relativePath = "."): Promise<SafeDirectoryResult | SafeReadResult> {
    const budget = this.budgetFor(root);
    if (!this.isKnownRoot(root) || !budget) return diagnostic("unsafe_reference");
    if (!this.adapterBudget.spend("artifacts")) return diagnostic("limit_exceeded");
    const backend = this.guardedBackend();
    let admitted;
    try { admitted = await admitPath(backend, this.options.dialect, root.canonicalPath, relativePath, this.options.limits?.maxLinkHops ?? SCAN_LIMITS_V1.maxLinkHops); }
    catch (error) {
      if (error instanceof PathPolicyError && error.code === "limit_exceeded") return diagnostic("limit_exceeded");
      return diagnostic("unsafe_reference");
    }
    if (admitted.stat.type !== "directory") return diagnostic("unsafe_reference");
    const relative = this.options.dialect.relative(root.canonicalPath, admitted.canonicalPath);
    const depth = relative === "." ? 0 : relative.split("/").length;
    if (!budget.check("depth", depth)) return diagnostic("limit_exceeded");
    try {
      const rawEntries = await backend.readDirectory(admitted.canonicalPath);
      const entries = rawEntries.map((entry) => entry.normalize("NFC"));
      if (entries.some((entry) => entry === "" || entry === "." || entry === ".." || entry.includes("/") || entry.includes("\\") || entry.includes("\u0000"))) {
        return diagnostic("unsafe_reference");
      }
      const sorted = entries.sort((a, b) => this.options.dialect.compare(this.options.dialect.join(admitted.canonicalPath, a), this.options.dialect.join(admitted.canonicalPath, b)));
      if (!budget.check("entries", sorted.length)) return diagnostic("limit_exceeded");
      return { ok: true, entries: sorted };
    } catch {
      return diagnostic("not_found");
    }
  }
}