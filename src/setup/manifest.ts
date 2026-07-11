import { createHash } from "node:crypto";

export interface SetupManifestEntry { readonly path: string; readonly sha256: string; }
export interface SetupManifest { readonly version: 1; readonly files: readonly SetupManifestEntry[]; }
export const contentHash = (content: string): string => createHash("sha256").update(content, "utf8").digest("hex");
export const createManifest = (files: readonly { readonly path: string; readonly content: string }[]): SetupManifest => ({ version: 1, files: Object.freeze(files.map((file) => ({ path: file.path, sha256: contentHash(file.content) }))) });
export const isManifest = (value: unknown): value is SetupManifest => { if (typeof value !== "object" || value === null) return false; const candidate = value as Partial<SetupManifest>; return candidate.version === 1 && Array.isArray(candidate.files) && candidate.files.every((entry) => typeof entry?.path === "string" && typeof entry?.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.sha256)); };
