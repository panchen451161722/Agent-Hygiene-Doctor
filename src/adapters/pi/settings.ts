export type PiDefaultProjectTrust = "always" | "ask" | "never";

export interface PiSettingsProjection {
  readonly defaultProjectTrust: PiDefaultProjectTrust;
}

export const projectPiSettings = (value: unknown): PiSettingsProjection => {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const defaultProjectTrust = record.defaultProjectTrust === "always" || record.defaultProjectTrust === "never" ? record.defaultProjectTrust : "ask";
  return Object.freeze({ defaultProjectTrust });
};
