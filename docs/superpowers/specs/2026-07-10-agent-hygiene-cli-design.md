# Agent Hygiene CLI Design

**Status:** Approved for implementation planning

**Date:** 2026-07-10

## Summary

Agent Hygiene is an open-source, zero-configuration developer CLI that performs a read-only health check of local AI-agent environments. Version 0.1 supports Codex, Claude Code, and Hermes through independent adapters and leaves a stable interface for Cursor and other tools. The npm package is `agent-hygiene-cli` and its installed executable is `agent-hygiene`; the unscoped npm name `agent-hygiene` is already owned by an unrelated project.

The primary usage is agent-driven. A developer can paste one instruction into an agent, which runs the package through `npx`, scans the machine and current project, and explains the structured recommendations. The `doctor` process never edits configuration or makes network requests. An optional, explicitly confirmed `setup` command installs a small launcher skill for repeated use.

## Goals

- Run without an Agent Hygiene configuration file.
- Detect Codex, Claude Code, and Hermes automatically on Windows, macOS, and Linux.
- Inventory skills, MCP servers, instruction files, rules, plugins, hooks, and relevant configuration sources.
- Detect deterministic hygiene problems within one agent and across agents.
- Estimate context size while distinguishing always-loaded, conditional, lazy, deferred, and unknown content.
- Give every actionable finding evidence, impact, a recommendation, and safe manual steps.
- Emit stable human-readable and versioned JSON reports.
- Preserve a small adapter boundary so another agent can be supported without changing analyzers or reporters.
- Be safe on a real developer machine: bounded reads, no code execution, no secret disclosure, and no writes from `doctor`.

## Non-goals for 0.1

- Automatic cleanup or configuration repair.
- Semantic or embedding-based similarity detection.
- Version upgrades or online currency checks.
- Hook performance measurement.
- Reading chat transcripts, credentials, session databases, or memory contents for usage analysis.
- Declaring a component unused from the absence of telemetry.
- A desktop user interface.
- Standalone native binaries. Version 0.1 requires Node.js 22 or newer.

## User Experience

### Zero-install scan

The README provides a prompt that can be pasted into an agent:

```text
Run the following command, analyze the diagnostic result, and explain the
recommended manual actions. Do not modify agent configuration.

npx -y agent-hygiene-cli@latest doctor --agent-mode
```

`npx` may download the package and write npm cache data before the CLI starts. The read-only and offline guarantees begin after package resolution, at `agent-hygiene` process startup. No Agent Hygiene configuration is created. Read-only tests therefore execute an already installed packed CLI and keep package-manager caches outside the filesystem snapshot.

### CLI surface

```bash
agent-hygiene doctor
agent-hygiene doctor --agent codex
agent-hygiene doctor --project ./my-project
agent-hygiene doctor --format json
agent-hygiene doctor --agent-mode
agent-hygiene doctor --fail-on warning

agent-hygiene setup --dry-run
agent-hygiene setup --yes
agent-hygiene setup --yes --force
agent-hygiene setup --uninstall
```

`doctor` defaults to all supported agents, the current working directory as the selected working directory, and a terminal report when stdout is a TTY. `--project <path>` replaces the selected working directory and must name an existing directory. The generic project root is the nearest ancestor containing a `.git` file or directory, without invoking Git; if none exists, it is the selected working directory. The Codex adapter may refine its own project root using a statically established `project_root_markers` value. Every agent-specific root must contain the selected working directory, or that adapter records partial coverage instead of scanning an unrelated ancestor chain.

`--agent-mode` means non-interactive JSON output with styling disabled. `--format json` also writes only JSON to stdout. Version 0.1 has no report-file option: `doctor` reports to stdout and never writes a report to disk.

Exit codes are stable:

- `0`: the scan completed, even if findings exist.
- `1`: the scan completed and met the requested `--fail-on error|warning` threshold.
- `2`: CLI arguments were invalid or the scan core could not produce a trustworthy report.

A missing agent is not an error. A failed or partial adapter is represented in the report while other adapters continue. `--fail-on` counts only completed findings at or above the threshold. Partial coverage never creates an absence-based finding and does not by itself change the exit code; exit code `2` is reserved for invalid arguments or failure to construct a schema-valid report.

### Optional launcher skill

`setup` detects supported agents and proposes these user-scope destinations:

- Codex: `$HOME/.agents/skills/agent-hygiene/`
- Claude Code: `$CLAUDE_CONFIG_DIR/skills/agent-hygiene/`, defaulting to `$HOME/.claude/skills/agent-hygiene/`
- Hermes: `$HERMES_HOME/skills/agent-hygiene/`, using the platform default when `HERMES_HOME` is absent

The generated `SKILL.md` only instructs the agent to run `agent-hygiene-cli` at the exact installing package version in `--agent-mode` and explain its manual recommendations. Diagnostic logic is never copied into the skill.

Each destination contains `SKILL.md` and `.agent-hygiene-owner.json`. The manifest contains a fixed owner id, manifest schema version, exact npm package name and version, and the SHA-256 of the exact `SKILL.md` bytes. Keeping the hash outside `SKILL.md` avoids a self-referential hash. `setup` is the only command allowed to write. It shows a dry run by default and writes only with `--yes` in non-interactive use.

Setup rejects any symlink, junction, reparse point, device path, alternate data stream, or drive-relative path in an existing destination component. It creates temporary files exclusively in the destination directory and renames them into place; the ownership manifest is installed last. It never follows a destination link. A non-owned destination is never overwritten. `--force` may replace a locally modified, already-owned installation at the exact displayed destination, but it cannot take over non-owned files or affect link targets. `--uninstall` removes exactly the two owned regular files only when the manifest is valid and the current `SKILL.md` hash matches; it never deletes a modified skill, even with `--force`, and removes the directory only when empty.

## Architecture

The implementation uses TypeScript, Node.js 22 or newer, pnpm, and ESM. Runtime dependencies remain small: a CLI argument parser, YAML parser, TOML parser, and terminal color helper. Vitest is used for tests.

```text
CLI
  -> Scan Orchestrator
      -> Codex Adapter
      -> Claude Code Adapter
      -> Hermes Adapter
  -> Normalized Inventory
  -> Cross-Agent Analyzers
  -> Findings
      -> Terminal Reporter
      -> JSON Reporter
```

### Adapter contract

```ts
type Coverage = "complete" | "partial" | "unknown";

interface ScanContext {
  readonly platform: "win32" | "darwin" | "linux";
  readonly paths: PathDialect;
  readonly selectedWorkingDirectory: AbsolutePath;
  readonly genericProjectRoot: AbsolutePath;
  readonly userHome: AbsolutePath;
  readonly environment: Readonly<AllowlistedEnvironment>;
  readonly roots: RootRegistry;
  readonly fs: SafeFileSystem;
  readonly limits: ScanLimitsV1;
  readonly clock: Clock;
  readonly toolVersion: string;
}

interface DiscoveryResult {
  artifacts: ArtifactReference[];
  diagnostics: Diagnostic[];
  coverage: Coverage;
}

interface InspectionResult {
  inventory: InventoryItem[];
  diagnostics: Diagnostic[];
  coverage: Coverage;
}

interface AgentAdapter {
  readonly id: AgentId;
  detect(context: ScanContext): Promise<DetectionResult>;
  discover(context: ScanContext): Promise<DiscoveryResult>;
  inspect(
    artifacts: ArtifactReference[],
    context: ScanContext,
  ): Promise<InspectionResult>;
}
```

The orchestrator constructs one immutable context. Adapters and analyzers may not read `process.env`, `process.cwd()`, `os.homedir()`, the host clock, or the host `path` dialect directly. The allowlisted environment snapshot includes only documented path and activation variables needed by the adapters, plus `PATH` and `PATHEXT`; values remain internal and are never copied into report metadata.

An adapter owns agent-specific roots, file formats, scope precedence, disabled state, effective-versus-candidate classification, and agent-specific validity. It emits typed inventory facts and diagnostics, not findings. Generic analyzers map those facts to the versioned rule catalog, so adding Cursor does not require reporter changes or agent branches in analyzer code.

The orchestrator runs selected adapters with bounded concurrency. It retains per-artifact and adapter failures as typed diagnostics and passes complete and partial inventories to analyzers. An analyzer that requires absence or full enumeration must suppress its finding unless the relevant coverage is `complete`.

### Suggested source layout

```text
src/
  cli/
  core/
    adapter.ts
    inventory.ts
    finding.ts
    safe-fs.ts
    redaction.ts
  adapters/
    codex/
    claude/
    hermes/
  analyzers/
    skills.ts
    mcp.ts
    context.ts
    configuration.ts
  reporters/
    terminal.ts
    json.ts
  rules/
    catalog.ts
```

### Filesystem boundary

All reads go through the injected `SafeFileSystem`. Internally it tracks absolute paths, but report DTOs receive only root-relative `SourceRef` values. A root is admitted only through this table:

| Root class | Admission rule | Allowed operation |
|---|---|---|
| Primary content root | Selected project chain, user home owned by an adapter, or a documented managed location | Bounded traversal and regular-file reads |
| Typed external directory | Only a documented directory field such as Hermes `skills.external_dirs` or a documented plugin-cache override | Bounded traversal within that one directory |
| Typed external file | Only a documented exact-file reference such as an instruction import | Read that regular file only; no sibling traversal |
| Executable reference | Absolute command field or a candidate found through injected `PATH` | Metadata-only regular-file and executable checks |
| Ordinary string or unrecognized reference | Never admitted | Emit `unsafe_reference` and do not read |

Referenced paths do not automatically become roots. At most 64 roots are admitted per adapter. A rejected or escaping target is represented by a typed observation and diagnostic, never followed.

Before admission, paths reject NULs, Windows device namespaces, alternate data streams, drive-relative paths, and cross-drive or incompatible UNC comparisons. Roots are canonicalized once. Containment uses path-segment-aware relative checks under the injected dialect, with Windows drive, UNC, and case rules. Traversal checks every existing ancestor with `lstat`; symlinks and junctions may be followed only when their canonical target remains inside the same admitted root, with at most eight link hops. Directories and regular files are the only accepted types. FIFOs, sockets, devices, and other special files are skipped.

Files are opened first, validated with the handle's metadata, and read through the handle up to `maxFileBytes + 1`; `stat.size` is not trusted as the bound. Version 0.1 protects against accidental mutation but does not claim safety against a hostile same-user process racing path changes during the scan. Tests and guarantees assume the scanned tree is not adversarially mutated while `doctor` runs.

### Deterministic scan limits

`ScanLimitsV1` is part of the rule catalog and has these defaults:

| Limit | Value | Scope |
|---|---:|---|
| Concurrent filesystem operations | 8 | Whole scan |
| Admitted roots | 64 | Per adapter |
| Files | 10,000 | Per root |
| Bytes read | 64 MiB | Per root |
| Directory depth | 16 | Per root |
| Entries in one directory | 10,000 | Per directory |
| Artifacts | 20,000 | Per adapter |
| Individual file bytes | 1 MiB | Per file |
| Symlink or junction hops | 8 | Per resolved path |
| Parser nesting depth | 64 | Per document |
| Parser nodes | 100,000 | Per document |
| YAML aliases | 50 | Per document |

Directory entries are normalized and sorted by the injected path dialect before budget consumption. Budgets are independent per root and adapter, so adapter concurrency cannot change which files win. Exceeding any budget emits `limit_exceeded`, marks the affected coverage `partial`, and stops only that bounded scope. Partial scopes cannot support absence-based conclusions.

Parsers project only whitelisted fields into typed facts. They catch third-party exceptions inside the parser boundary and return only a stable code, `SourceRef`, and optional line and column. Library messages, source excerpts, input values, raw errors, and stacks are discarded before crossing the boundary. Raw parsed documents and sensitive values are not stored in inventory, diagnostics, or findings. Final-output redaction remains defense in depth. The injected filesystem, path dialect, environment, and clock make Windows and POSIX adapter tests independent of the test host.

## Normalized Data Model

```ts
interface SourceRef {
  rootId: string;
  relativePath: string; // "." or slash-separated, never absolute
}

interface RootDescriptor {
  id: string;
  kind: "project" | "home" | "agent-home" | "managed" | "external";
  alias: string; // e.g. "<project>", "~", "$CODEX_HOME", "external-skill-root-1"
}

interface InventoryItem {
  itemId: string;
  agent: AgentId;
  kind:
    | "skill"
    | "mcp"
    | "instruction"
    | "configuration"
    | "rule"
    | "plugin"
    | "hook";
  name: string;
  source: SourceRef;
  scope: "user" | "project" | "managed" | "plugin" | "external";
  status: "active" | "disabled" | "shadowed" | "candidate" | "unresolved";
  loading: "always" | "conditional" | "lazy" | "deferred" | "unknown";
  fingerprint?: string;
  estimatedTokens?: number;
  facts:
    | SkillFacts
    | McpFacts
    | InstructionFacts
    | ConfigurationFacts
    | ExtensionFacts;
}

interface SkillFacts {
  type: "skill";
  effectiveName?: string;
  frontmatter: "valid" | "malformed" | "missing";
  nameUsable: boolean;
  descriptionUsable: boolean;
}

interface McpFacts {
  type: "mcp";
  transport: "stdio" | "http" | "sse" | "unknown";
  endpointFingerprint?: string;
  commandResolution?: "resolved" | "not-found" | "unknown";
  credentialLikeFields: string[]; // field names only
  packageInvocation?: "exact" | "unpinned" | "not-applicable" | "unknown";
  urlClass?: "loopback" | "tls" | "plaintext-remote" | "unknown";
}

interface InstructionFacts {
  type: "instruction";
  byteLength: number;
  normalizedContentFingerprint: string;
  condition: "global" | "path-scoped" | "on-demand" | "unknown";
}

interface ConfigurationFacts {
  type: "configuration";
  format: "json" | "yaml" | "toml";
  parseStatus: "valid" | "invalid";
  precedence: number;
}

interface ExtensionFacts {
  type: "extension";
  extensionKind: "rule" | "plugin" | "hook";
  activation: "active" | "disabled" | "candidate" | "unknown";
}

type Evidence =
  | { kind: "source"; source: SourceRef }
  | { kind: "field"; source: SourceRef; field: string }
  | {
      kind: "metric";
      metric: "bytes" | "estimatedTokens" | "count";
      value: number;
      threshold?: number;
    }
  | { kind: "items"; itemIds: string[] };

type DiagnosticCode =
  | "read_failed"
  | "parse_error"
  | "unsafe_reference"
  | "limit_exceeded"
  | "unsupported_value"
  | "adapter_failed";

interface Diagnostic {
  code: DiagnosticCode;
  severity: "info" | "warning" | "error";
  agent?: AgentId;
  source?: SourceRef;
  line?: number;
  column?: number;
  coverageImpact: "none" | "partial" | "unknown";
  message: string; // selected from an internal catalog, never a library message
}

interface AdapterState {
  agent: AgentId;
  status: "not-detected" | "complete" | "partial" | "failed";
  coverage: Coverage;
  inventoryCount: number;
  diagnosticCodes: DiagnosticCode[];
}

interface Finding {
  ruleId: string;
  instanceId: string;
  severity: "info" | "warning" | "error";
  category: string;
  title: string;
  impact: string;
  evidence: Evidence[];
  recommendation: string;
  manualSteps: string[];
  confidence: "high" | "medium" | "low";
  actionable: boolean;
}

interface ReportV1 {
  schemaVersion: 1;
  tool: { name: "agent-hygiene-cli"; version: string };
  scan: {
    startedAt: string;
    durationMs: number;
    platform: "win32" | "darwin" | "linux";
    projectRoot: SourceRef;
    selectedWorkingDirectory: SourceRef;
    selectedAgents: AgentId[];
    limits: ScanLimitsV1;
    coverage: Coverage;
  };
  roots: RootDescriptor[];
  adapters: AdapterState[];
  summary: {
    inventoryCount: number;
    findings: { info: number; warning: number; error: number };
    diagnostics: { info: number; warning: number; error: number };
  };
  inventory: InventoryItem[];
  findings: Finding[];
  diagnostics: Diagnostic[];
}
```

The implementation checks in `schema/report-v1.schema.json` with all properties required where applicable and `additionalProperties: false` at every object boundary. The report builder validates its own invariants before serialization. Raw `Error` objects and stacks are never serializable report inputs.

`itemId` is SHA-256 over the item's agent, kind, canonical effective name, and `SourceRef`. `instanceId` is SHA-256 over `ruleId` plus sorted evidence anchors. Hashes use lowercase hexadecimal. Inventories retain provenance and status rather than merging equal items. Cross-agent comparisons operate on redacted fingerprints.

Root descriptors never contain physical environment-root values. Known roots use stable aliases; configured external roots receive deterministic ordinal aliases after canonical paths are internally sorted. Terminal paths render from aliases, using `~` and `<project>` where possible. JSON relative paths always use `/`, including on Windows.

Arrays have fixed sort keys: roots by id; adapters and selected agents by the built-in agent order; inventory by agent, kind, case-folded name, source, then `itemId`; findings by severity descending, `ruleId`, then `instanceId`; diagnostics by agent, code, source, line, and column. Timestamps and duration vary by run, but structure, identifiers, ordering, and all content derived from an unchanged fixture are deterministic.

Context estimates use Unicode character count divided by four and rounded up, are labeled `est.`, and never imply that lazy or deferred bodies are resident.

## Adapter Scope

### Codex

The adapter inspects these bounded sources when present:

- User configuration under `CODEX_HOME`, defaulting to `$HOME/.codex`: `config.toml`, `hooks.json`, global `AGENTS.override.md` before `AGENTS.md`, and the profile selected by a statically established top-level `profile`. Other `*.config.toml` profile files are candidates because a CLI `--profile` override is unknowable.
- `.codex/config.toml` and `.codex/hooks.json` in every directory from the Codex project root through the selected working directory, plus inline hook tables. Project layers are active only when trust is established from inspected configuration; otherwise they are unresolved candidates.
- Project instruction discovery from project root through the selected working directory, choosing at most one file per directory in `AGENTS.override.md`, `AGENTS.md`, then configured fallback order.
- `.agents/skills` in every directory from the selected working directory up through the repository root, `$HOME/.agents/skills`, documented admin `/etc/codex/skills` when applicable, and statically located enabled-plugin skill roots. System-bundled skills are included only when the installation exposes a documented local root; otherwise bundled-skill coverage is `unknown`.
- MCP tables, skill-disable entries, plugins, hooks, and extension references in inspected configuration.

Codex can show two same-name skills simultaneously. Therefore active same-name skills remain collision candidates; the adapter does not mark one shadowed merely because it is closer to the working directory. Explicitly disabled skills remain disabled.

The adapter does not run Codex, start MCP servers, execute hooks, or infer current-session configuration.

### Claude Code

The adapter inspects:

- `CLAUDE_CONFIG_DIR`, defaulting to `$HOME/.claude`, for settings, user skills, rules, instructions, and installed-plugin manifests and component roots. Plugin persistent data is excluded.
- Project `.claude/settings.json`, `.claude/settings.local.json`, `.claude/skills`, `.claude/rules`, `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, and `.mcp.json`.
- Documented `managed-settings.d/*.json`, `managed-settings.json`, and `managed-mcp.json` filesystem locations when readable, but never registry values, MDM services, `policyHelper`, or remote policy execution.
- `~/.claude.json` as a separate application-level file, through bounded parsing and immediate projection only of documented user/local MCP definitions and non-secret project approval state.
- Exact files referenced by `CLAUDE.md` `@` imports, through the documented maximum of five hops. An import whose approval state cannot be known is retained as unresolved.

Declared sources remain separate from effective policy when activation depends on workspace trust, managed policy, CLI flags, or an embedding host. Settings precedence is managed, CLI, local project, shared project, then user; array-valued settings use their documented merge and deduplication semantics rather than scalar replacement. The adapter never reads transcripts, credential files, plugin persistent data, session history, file snapshots, or auto-memory contents.

### Hermes

The adapter inspects:

- The effective home from explicit `HERMES_HOME`; otherwise `~/.hermes` on POSIX and `%LOCALAPPDATA%\\hermes` on native Windows, falling back to `%USERPROFILE%\\AppData\\Local\\hermes` when `LOCALAPPDATA` is absent.
- `<default-root>/active_profile` and immediate `<default-root>/profiles/<name>` directories as profile candidates. If `HERMES_HOME` is absent, the platform default remains the effective home; a sticky non-default `active_profile` is unresolved rather than silently treated as effective.
- Active-home `config.yaml` for `mcp_servers`, `skills.external_dirs`, `plugins.enabled`, `plugins.disabled`, and activation fields. `.env` is not read or sourced; values whose activation depends on it are unresolved.
- Active-home `skills`, configured external skill roots, and active-home `SOUL.md`. Local skills win documented same-name collisions with external skills. `SOUL.md` is always-loaded system-prompt content, not metadata-only, and is read only through the normal bounded/redacted path.
- Official plugin source classes: bundled installation plugins, active-home `plugins`, project `.hermes/plugins` gated by `HERMES_ENABLE_PROJECT_PLUGINS=true`, Python entry points, and Nix-provided plugins. The adapter inspects only statically located admitted roots. Entry-point or Nix resolution that would require importing code or querying a runtime is recorded as unresolved. `plugins.disabled` wins; activation accounts for opt-in general plugins and documented auto-loaded plugin categories.
- Project instruction candidates under the selected project boundary.

Runtime MCP activation comes only from active `config.yaml:mcp_servers`; `enabled: false` is disabled. `optional-mcps/*/manifest.yaml` entries are installable catalog candidates, never active runtime definitions merely because they exist. The adapter never imports Python plugins, sources `.env`, reads OAuth token files, opens `state.db`, or reads memory contents.

## Diagnostic Rules

Rules are deterministic and versioned. Similarity in 0.1 means exact or normalized-content equality, never semantic similarity.

| ID | Severity | Condition |
|---|---|---|
| `AH-CFG-001` | error | A relevant JSON, YAML, or TOML document cannot be parsed. |
| `AH-CFG-002` | warning | A discovered source exists but activation cannot be established statically. |
| `AH-CFG-003` | info | An adapter can prove that a lower-precedence source is shadowed by a higher-precedence source. |
| `AH-FS-001` | warning | An existing relevant source is unreadable, unsafe, or a special file and is skipped. |
| `AH-FS-002` | warning | A scan budget is exhausted and the affected coverage is partial. |
| `AH-SKL-001` | warning | `SKILL.md` frontmatter is malformed. |
| `AH-SKL-002` | warning | A skill lacks a usable name or description under that agent's rules. |
| `AH-SKL-003` | warning | One agent has two active skills with the same canonical effective name and no deterministic winner. |
| `AH-SKL-004` | info | Two skills within one agent have identical normalized content. |
| `AH-SKL-005` | warning | A declared skill root, reference, or link cannot be resolved safely. |
| `AH-MCP-001` | error | A credential-like value appears inline where an environment reference is supported. The value is never reported. |
| `AH-MCP-002` | warning | Active definitions across agents share a redacted command-or-URL fingerprint. |
| `AH-MCP-003` | warning | The bounded executable-resolution algorithm confidently returns `not-found`; `unknown` does not warn. |
| `AH-MCP-004` | warning | A non-loopback remote MCP URL uses plaintext HTTP. |
| `AH-MCP-005` | warning | A package runner invokes an unpinned package spec. This is not proof of compromise. |
| `AH-CTX-001` | warning | Known always-loaded instructions exceed a documented limit or labeled heuristic. |
| `AH-CTX-002` | info | Two always-loaded instruction sources within one agent have identical normalized content. |
| `AH-CTX-003` | warning | A conditional rule cannot be classified safely and may be treated as global. |
| `AH-EXT-001` | info | Executable extension surfaces are present and summarized without execution. |
| `AH-XAG-001` | info | Skill or instruction content is duplicated across agents. |

Text fingerprints accept UTF-8 with an optional BOM. Normalization converts CRLF and CR to LF, applies Unicode NFC, removes trailing horizontal whitespace on each line, and removes leading and trailing blank lines. It preserves case and internal whitespace. The fingerprint is SHA-256 of the normalized UTF-8 bytes. Canonical names trim, apply NFC, and ASCII-case-fold; adapters first apply the agent's documented effective-name rule.

MCP fingerprints never hash raw environment values, headers, credentials, arbitrary argument values, URL user information, fragments, or query values. A stdio fingerprint contains the transport, internally canonicalized or literal command, recognized package spec, ordered option names, argument-shape placeholders, and sorted environment variable names. An HTTP fingerprint lowercases scheme and host, removes a default port, normalizes dot segments, replaces credential-like or high-entropy path segments, drops user information and fragments, and retains sorted query names only. The safe canonical structure is then SHA-256 hashed.

Credential-like field matching is ASCII-case-insensitive over `token`, `secret`, `password`, `api-key`/`api_key`, `authorization`, `bearer`, and `credential` variants. A non-empty literal triggers only where that adapter supports an environment reference; recognized `${VAR}`, `$VAR`, and documented environment-reference forms do not. The value is discarded immediately.

Package-runner recognition covers `npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, and `bunx`. An exact `x.y.z` semantic version or immutable full Git commit is pinned. Missing versions, tags, ranges, prerelease ranges, Git branches, and shortened commits are unpinned.

Executable resolution uses only the injected filesystem, working directory, `PATH`, and `PATHEXT`. Absolute paths must be regular files and, on POSIX, have an executable bit. Windows matching is case-insensitive and applies `PATHEXT`. Registry App Paths, shell profiles, shebang interpreters, package-manager lookup, and command execution are excluded. Empty `PATH` segments and unsupported platform semantics yield `unknown`, not `not-found`.

For Codex, `AH-CTX-001` uses the effective `project_doc_max_bytes`, defaulting to the documented 32 KiB, and reports known truncation risk. For agents without a documented limit, the version 1 heuristic warns when known always-loaded instruction content exceeds 16,000 estimated tokens per agent. A documented threshold takes precedence; the generic heuristic is labeled medium confidence and never creates a duplicate finding. A known lower bound may trigger even under partial coverage, but the finding must say coverage is partial.

### Manual guidance rules

- Prefer disable, move, or scope reduction over deletion.
- Name the source root alias, exact relative path, and configuration key; use `~` and `<project>` aliases where applicable.
- Use a native command only when documented, non-destructive, and free of harvested values.
- Generate platform-appropriate instructions.
- Ask for manual confirmation before acting on a low-confidence finding.
- End actionable findings with a rerun step.
- Never include destructive shell commands by default.

## Reporting

The terminal report begins with a short summary and an explicit coverage line, then an agent/component table, followed by numbered findings. Partial and unknown coverage are visible before findings. Non-actionable warnings and informational findings are separated from recommendations.

JSON output is exactly one `ReportV1` document and validates against `schema/report-v1.schema.json`. It uses only `SourceRef` paths and contains no physical root values, secret values, library exception text, or stacks. JSON mode emits no styling or log text to stdout. In a successful JSON run, stderr is empty unless `--verbose` is explicitly selected; verbose logs use cataloged messages and pass through final redaction.

## Safety Requirements

- After the `agent-hygiene` process starts, `doctor` performs no filesystem writes and no network requests. Package-manager resolution before startup is outside this guarantee.
- No MCP command, hook, plugin, policy helper, credential helper, package runner, skill script, or embedded shell snippet is executed.
- Allowlisted environment values may be used internally for path and activation resolution. Only environment variable names may be reported; values are never expanded into reports.
- Credential-like keys are examined only to determine presence and reference form; values are discarded before inventory or fingerprint construction.
- Parser and traversal limits protect against oversized files, excessive nesting, YAML alias expansion, and cycles.
- Unreadable, unsafe, limited, and runtime-resolved sources are partial or unresolved, never absent.
- Configuration strings are untrusted data and are never interpolated into shell commands.
- Deferred MCP tools are not assigned resident context cost.
- Lack of usage evidence is never labeled disuse.
- No absence-based recommendation is emitted from partial or unknown coverage.
- The report schema is a privacy boundary: only typed safe evidence can cross it, and final redaction is defense in depth.

## Error Handling

Discovery and inspection errors are isolated per artifact and adapter. A bad document produces a sanitized `parse_error` diagnostic and an `AH-CFG-001` finding without stopping unrelated scans. An adapter exception is converted to cataloged `adapter_failed` data and a failed adapter state; its original message and stack are discarded.

Completed scans serialize typed diagnostics inside `ReportV1`. Invalid arguments and the inability to construct a schema-valid report exit `2`, write a cataloged redacted message to stderr, and write nothing to stdout. Partial adapters otherwise preserve the normal `0` or `--fail-on` exit behavior.

## Testing Strategy

- Unit tests cover safe filesystem behavior, root admission, every-component link checks, path-dialect containment, redaction, privacy-safe fingerprinting, token estimates, deterministic ids, rule severity, and manual-step generation.
- Report tests validate every fixture against the closed JSON schema and verify stable ordering, root aliases, summary counts, and rejection of raw errors or unknown properties.
- Each adapter has contract tests proving it emits typed inventory, diagnostics, and coverage without direct host-global access.
- Fixtures cover user, project, managed, plugin, disabled, shadowed, candidate, unresolved, partial, and malformed sources for all agents under injected Windows and POSIX contexts.
- Cross-agent tests cover duplicate skills, MCP definitions, and instructions.
- Security fixtures include oversized and growing files, deep and broad trees, malformed documents, parser bombs, YAML alias expansion, ancestor-link and junction escapes, special files where supported, shell injection strings, inline credentials, secret URL segments, and seeded secrets in parser errors.
- CLI integration tests execute the compiled binary and verify text, JSON, stderr, and exit codes.
- A before/after filesystem snapshot around the already installed packed CLI proves `doctor` made no writes; npm cache activity is outside the snapshot and process under test.
- Setup tests verify dry-run, explicit confirmation, two-file ownership, exact-byte hashes, atomic replacement, non-owned and modified-file refusal, destination link rejection, exact-file uninstall, and empty-directory cleanup.
- Release tests run `pnpm pack`, install the tarball in a temporary project, execute its `agent-hygiene` bin, and verify that `npx -y <tarball> doctor --agent-mode` selects the single declared bin.
- CI runs supported checks on Windows, macOS, and Linux.

## Acceptance Criteria

- After publication, a developer or agent can run `npx -y agent-hygiene-cli@latest doctor --agent-mode` without Agent Hygiene configuration.
- Codex, Claude Code, and Hermes are detected using platform-appropriate roots and environment overrides.
- Every actionable finding contains evidence, impact, recommendation, and manual steps.
- JSON output validates against the closed versioned schema, has deterministic identifiers and ordering, and contains no non-JSON stdout.
- Seeded secrets never appear in terminal output, JSON, verbose logs, or snapshots.
- After process startup, `doctor` executes no discovered code, makes no network request, and produces no filesystem write.
- Failure in one adapter does not suppress successful results from other adapters.
- Partial coverage is explicit and produces no absence-based recommendation.
- A Cursor adapter can be added by implementing `AgentAdapter` and emitting existing typed facts without modifying the report schema or reporters.
- `setup --yes` installs an owned launcher skill and separate manifest, and `setup --uninstall` safely removes only the two unchanged owned files.
- Tests, lint, type checking, build, and packed-package integration all pass.
- The README contains the exact package name, Node.js 22 requirement, bootstrap caveat, and a prompt that can be pasted directly into an agent.

## Primary References

- OpenAI Codex configuration: <https://developers.openai.com/codex/config-reference>
- OpenAI Codex skills: <https://developers.openai.com/codex/skills>
- OpenAI Codex MCP: <https://developers.openai.com/codex/mcp>
- OpenAI Codex hooks: <https://learn.chatgpt.com/docs/hooks>
- Anthropic Claude Code directory reference: <https://code.claude.com/docs/en/claude-directory>
- Anthropic Claude Code settings: <https://code.claude.com/docs/en/settings>
- Anthropic Claude Code skills: <https://code.claude.com/docs/en/skills>
- Anthropic Claude Code MCP: <https://code.claude.com/docs/en/mcp>
- Anthropic Claude Code managed MCP: <https://code.claude.com/docs/en/managed-mcp>
- Anthropic Claude Code plugins: <https://code.claude.com/docs/en/plugins-reference>
- Hermes path implementation: <https://github.com/NousResearch/hermes-agent/blob/main/hermes_constants.py>
- Hermes skills guide: <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md>
- Hermes MCP reference: <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/mcp-config-reference.md>
- Hermes plugins guide: <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/plugins.md>
- Hermes configuration guide: <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/configuration.md>
- Node.js supported releases: <https://nodejs.org/en/about/previous-releases>
- Existing unrelated `agent-hygiene` npm package: <https://www.npmjs.com/package/agent-hygiene>

## 1.1 Recoverable manual removal

`doctor` remains read-only. The only additional mutation commands are `remove` and `restore`. A removal command first creates a private immutable operation from exact inventory item IDs (or a TTY checkbox selection), then requires `agent-hygiene remove <operation-id> --yes` before any agent file changes. It supports only user/project Skills and active or disabled MCP definitions with a proven writable source; managed, plugin-owned, external, unresolved, and candidate sources are refused.

Every operation stores local recovery metadata protected by filesystem permissions in the user quarantine root, rechecks source fingerprints before mutation, preserves a verified complete Skill directory or original MCP file, and rolls back all selected targets after any failure. `agent-hygiene restore <operation-id> --yes` requires the removal post-image to remain untouched, so it never overwrites later user edits. Public command output contains safe SourceRef values only, never physical paths, configuration values, or backup content.
