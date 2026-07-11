export interface CodexConfigProjection { readonly profile?: string; readonly projectRootMarkers: readonly string[]; readonly projectDocMaxBytes: number; readonly trust: "trusted" | "untrusted" | "unknown"; }
export const projectCodexConfig = (value: unknown): CodexConfigProjection => {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const markers = Array.isArray(record.project_root_markers) ? record.project_root_markers.filter((entry): entry is string => typeof entry === "string") : [];
  const max = typeof record.project_doc_max_bytes === "number" && Number.isInteger(record.project_doc_max_bytes) && record.project_doc_max_bytes > 0 ? Math.min(record.project_doc_max_bytes, 32 * 1024) : 32 * 1024;
  const trust = record.trust === "trusted" || record.trust === "untrusted" ? record.trust : "unknown";
  return Object.freeze({ ...(typeof record.profile === "string" ? { profile: record.profile } : {}), projectRootMarkers: Object.freeze([...markers].sort()), projectDocMaxBytes: max, trust });
};
