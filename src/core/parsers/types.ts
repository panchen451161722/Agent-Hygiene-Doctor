import type { Diagnostic } from "../diagnostic.js";
import type { SourceRef } from "../source-ref.js";

export interface ParserLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxYamlAliases: number;
}

export const DEFAULT_PARSER_LIMITS: Readonly<ParserLimits> = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 64,
  maxNodes: 100_000,
  maxYamlAliases: 50,
});

export interface ParserOptions {
  readonly source?: SourceRef;
  readonly limits?: Partial<ParserLimits>;
}

export interface ParseSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ParseFailure {
  readonly ok: false;
  readonly diagnostic: Diagnostic;
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export const resolveParserLimits = (options?: ParserOptions): ParserLimits => ({
  ...DEFAULT_PARSER_LIMITS,
  ...(options?.limits ?? {}),
});
