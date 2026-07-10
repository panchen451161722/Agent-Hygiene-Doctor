export interface ScanLimitsV1 {
  readonly maxConcurrentFsOps: number;
  readonly maxRootsPerAdapter: number;
  readonly maxFilesPerRoot: number;
  readonly maxBytesPerRoot: number;
  readonly maxDirectoryDepth: number;
  readonly maxEntriesPerDirectory: number;
  readonly maxArtifactsPerAdapter: number;
  readonly maxFileBytes: number;
  readonly maxLinkHops: number;
  readonly maxParserDepth: number;
  readonly maxParserNodes: number;
  readonly maxYamlAliases: number;
}

export const SCAN_LIMITS_V1: Readonly<ScanLimitsV1> = Object.freeze({
  maxConcurrentFsOps: 8,
  maxRootsPerAdapter: 64,
  maxFilesPerRoot: 10_000,
  maxBytesPerRoot: 64 * 1024 * 1024,
  maxDirectoryDepth: 16,
  maxEntriesPerDirectory: 10_000,
  maxArtifactsPerAdapter: 20_000,
  maxFileBytes: 1024 * 1024,
  maxLinkHops: 8,
  maxParserDepth: 64,
  maxParserNodes: 100_000,
  maxYamlAliases: 50,
});
