# Agent Hygiene CLI Design

**Status:** Approved for implementation planning

**Date:** 2026-07-10

## Summary

Agent Hygiene is an open-source, zero-configuration developer CLI that performs a read-only health check of local AI-agent environments. Version 0.1 supports Codex, Claude Code, and Hermes through independent adapters and leaves a stable interface for Cursor and other tools.

The primary usage is agent-driven. A developer can paste one instruction into an agent, which runs the package through `npx`, scans the machine and current project, and explains the structured recommendations. The scan never edits configuration. An optional, explicitly confirmed `setup` command installs a small launcher skill for repeated use.

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
- Standalone native binaries. Version 0.1 requires an existing Node.js runtime.

## User Experience

### Zero-install scan

The README provides a prompt that can be pasted into an agent:

```text
Run the following command, analyze the diagnostic result, and explain the
recommended manual actions. Do not modify agent configuration.

npx -y agent-hygiene@latest doctor --agent-mode
```

`npx` downloads the package to its cache and runs it without a global installation. No Agent Hygiene configuration is created.

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
agent-hygiene setup --uninstall
```

`doctor` defaults to all supported agents, the current working directory as the project, and a terminal report when stdout is a TTY. `--agent-mode` means non-interactive JSON output with styling disabled. `--format json` also writes only JSON to stdout.

Exit codes are stable:

- `0`: the scan completed, even if findings exist.
- `1`: the scan completed and met the requested `--fail-on error|warning` threshold.
- `2`: CLI arguments were invalid or the scan core could not produce a trustworthy report.

A missing agent is not an error. A failed adapter is represented in the report while other adapters continue.

### Optional launcher skill

`setup` detects supported agents and proposes these user-scope destinations:

- Codex: `$HOME/.agents/skills/agent-hygiene/`
- Claude Code: `$CLAUDE_CONFIG_DIR/skills/agent-hygiene/`, defaulting to `$HOME/.claude/skills/agent-hygiene/`
- Hermes: `$HERMES_HOME/skills/agent-hygiene/`, using the platform default when `HERMES_HOME` is absent

The generated `SKILL.md` only instructs the agent to run the current Agent Hygiene CLI in `--agent-mode` and explain its manual recommendations. It contains an owner marker, schema version, generated content hash, and exact package version. Diagnostic logic is never copied into the skill.

`setup` is the only command allowed to write outside an explicitly requested report. It shows a dry run by default and writes only with `--yes` in non-interactive use. It does not overwrite a non-owned or locally modified skill unless `--force` is explicitly supplied. `--uninstall` removes only owned files whose content hash still matches.

## Architecture

The implementation uses TypeScript, Node.js, pnpm, and ESM. Runtime dependencies remain small: a CLI argument parser, YAML parser, TOML parser, and terminal color helper. Vitest is used for tests.

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
interface AgentAdapter {
  readonly id: AgentId;
  detect(context: ScanContext): Promise<DetectionResult>;
  discover(context: ScanContext): Promise<ArtifactReference[]>;
  inspect(
    artifacts: ArtifactReference[],
    context: ScanContext,
  ): Promise<AgentInventory>;
}
```

An adapter owns agent-specific roots, environment overrides, file formats, scope precedence, disabled state, and effective-versus-candidate classification. It does not emit cross-agent findings.

The orchestrator runs selected adapters with bounded concurrency. It retains adapter failures as diagnostics and passes successful inventories to generic analyzers.

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

All reads go through an injected `SafeFileSystem` interface. It enforces maximum file size, maximum traversal depth, a bounded file count, canonical-path deduplication, and scan boundaries. It uses `lstat` before following links and does not follow a symlink or junction outside a configured root. An out-of-bound link is reported rather than followed.

Parsers project only whitelisted fields into inventory records. Raw parsed documents and sensitive values are not stored in inventory or findings. The filesystem abstraction makes all adapters testable against fixtures without touching real user directories.

## Normalized Data Model

```ts
interface InventoryItem {
  agent: AgentId;
  kind: InventoryKind;
  name: string;
  sourcePath: string;
  scope: "user" | "project" | "managed" | "plugin" | "external";
  status: "active" | "disabled" | "shadowed" | "candidate" | "unresolved";
  loading: "always" | "conditional" | "lazy" | "deferred" | "unknown";
  fingerprint?: string;
  estimatedTokens?: number;
  metadata: RedactedMetadata;
}

interface Finding {
  id: string;
  severity: "info" | "warning" | "error";
  category: string;
  title: string;
  impact: string;
  evidence: Evidence[];
  recommendation: string;
  manualSteps: string[];
  confidence: "high" | "medium" | "low";
}
```

Inventories retain provenance and status rather than merging equal items. Cross-agent comparisons operate on redacted fingerprints. Context estimates use `characters / 4`, are labeled `est.`, and never imply that lazy or deferred bodies are resident.

## Adapter Scope

### Codex

The adapter inspects these bounded sources when present:

- User configuration under `CODEX_HOME`, defaulting to `$HOME/.codex`, including `config.toml`, referenced profile files, and global `AGENTS.md` or `AGENTS.override.md`.
- Project `.codex/config.toml` as a declared source. Trust-dependent activation is unresolved unless established without invoking Codex.
- Project instruction discovery from project root to selected working directory.
- User and project `.agents/skills` roots, with canonical-path deduplication.
- MCP tables, skill-disable entries, plugins, hooks, and extension references in inspected configuration.

The adapter does not run Codex, start MCP servers, execute hooks, or infer current-session configuration.

### Claude Code

The adapter inspects:

- `CLAUDE_CONFIG_DIR`, defaulting to `$HOME/.claude`, for settings, user skills, rules, instructions, and plugin metadata.
- Project `.claude/settings.json`, `.claude/settings.local.json`, `.claude/skills`, `.claude/rules`, `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, and `.mcp.json`.
- Default managed filesystem locations when readable, but never registry values, MDM services, `policyHelper`, or remote policy execution.
- `~/.claude.json` through bounded parsing and immediate projection of the specific non-secret keys needed for MCP provenance and extension state.

Declared sources remain separate from effective policy when activation depends on workspace trust, managed policy, CLI flags, or an embedding host. The adapter never reads transcripts, credential files, plugin data, session history, or auto-memory contents by default.

### Hermes

The adapter inspects:

- `HERMES_HOME`; otherwise `~/.hermes` on POSIX and `%LOCALAPPDATA%\\hermes` on native Windows.
- The active profile plus immediate profile candidates without inventing Hermes path encoding.
- `config.yaml` for `mcp_servers`, external skill directories, plugins, and activation fields.
- `$HERMES_HOME/skills`, configured external skill roots, `$HERMES_HOME/plugins`, `SOUL.md` metadata, and project instruction candidates.
- The managed POSIX overlay when configured or readable.

It treats `mcp.json` distribution files as candidates rather than active runtime MCP configuration. It never imports Python plugins, sources `.env`, reads OAuth token files, opens `state.db`, or reads memory contents.

## Diagnostic Rules

Rules are deterministic and versioned. Similarity in 0.1 means exact or normalized-content equality, never semantic similarity.

| ID | Severity | Condition |
|---|---|---|
| `AH-CFG-001` | error | A relevant JSON, YAML, or TOML document cannot be parsed. |
| `AH-CFG-002` | warning | A discovered source exists but activation cannot be established statically. |
| `AH-CFG-003` | info | A lower-precedence source is shadowed by a higher-precedence source. |
| `AH-SKL-001` | warning | `SKILL.md` frontmatter is malformed. |
| `AH-SKL-002` | warning | A skill lacks a usable name or description under that agent's rules. |
| `AH-SKL-003` | warning | Two active skills have the same effective name in a collision-capable scope. |
| `AH-SKL-004` | info | Two skills have identical normalized content. |
| `AH-SKL-005` | warning | A declared skill root, reference, or link cannot be resolved safely. |
| `AH-MCP-001` | error | A credential-like value appears inline where an environment reference is supported. The value is never reported. |
| `AH-MCP-002` | warning | Active definitions across agents share a redacted command-or-URL fingerprint. |
| `AH-MCP-003` | warning | A stdio command cannot be resolved from its absolute path or inherited PATH without execution. |
| `AH-MCP-004` | warning | A non-loopback remote MCP URL uses plaintext HTTP. |
| `AH-MCP-005` | warning | A package runner invokes an unpinned package spec. This is not proof of compromise. |
| `AH-CTX-001` | warning | Known always-loaded instructions exceed a documented limit or labeled heuristic. |
| `AH-CTX-002` | info | Always-loaded instruction sources share identical normalized blocks. |
| `AH-CTX-003` | warning | A conditional rule cannot be classified safely and may be treated as global. |
| `AH-EXT-001` | info | Executable extension surfaces are present and summarized without execution. |
| `AH-XAG-001` | info | Skills, MCP servers, or instruction content are duplicated across agents. |

Thresholds and normalization rules live in the versioned rule catalog rather than adapters. Documented thresholds take precedence over generic heuristics. Heuristic findings name the heuristic and use medium or low confidence.

### Manual guidance rules

- Prefer disable, move, or scope reduction over deletion.
- Name the exact path and configuration key, using `~` for the current home in display output.
- Use a native command only when documented, non-destructive, and free of harvested values.
- Generate platform-appropriate instructions.
- Ask for manual confirmation before acting on a low-confidence finding.
- End actionable findings with a rerun step.
- Never include destructive shell commands by default.

## Reporting

The terminal report begins with a short summary, then an agent/component table, followed by numbered findings. Warnings requiring no action are separated from recommendations.

The JSON report has `schemaVersion: 1` and contains scan metadata, adapter states, a summary, inventories, and findings. Paths are rendered relative to `~` or the project where possible; sensitive values are redacted. JSON mode emits no styling or log text to stdout. Verbose logs go to stderr and pass through redaction.

## Safety Requirements

- `doctor` performs no filesystem writes and no network requests.
- No MCP command, hook, plugin, policy helper, credential helper, package runner, skill script, or embedded shell snippet is executed.
- Environment variable names may be reported; values are never expanded into reports.
- Credential-like keys are examined only to determine presence, then discarded.
- Parser and traversal limits protect against oversized files, excessive nesting, YAML alias expansion, and cycles.
- Unreadable managed paths are unresolved, not absent.
- Configuration strings are untrusted data and are never interpolated into shell commands.
- Deferred MCP tools are not assigned resident context cost.
- Lack of usage evidence is never labeled disuse.

## Error Handling

Discovery and inspection errors are isolated per artifact and adapter. A bad document produces a finding and does not stop unrelated scans. An adapter exception is captured as a failed adapter state. The CLI exits with code `2` only when argument parsing fails or the orchestrator cannot produce a structurally valid report.

JSON mode serializes errors inside the schema. Human diagnostics and verbose logs use stderr only and remain redacted.

## Testing Strategy

- Unit tests cover safe filesystem behavior, path resolution, redaction, fingerprinting, token estimates, rule severity, and manual-step generation.
- Each adapter has contract tests proving it emits the normalized inventory schema.
- Fixtures cover user, project, managed, plugin, disabled, shadowed, and malformed sources for all agents on simulated Windows and POSIX paths.
- Cross-agent tests cover duplicate skills, MCP definitions, and instructions.
- Security fixtures include oversized files, deep trees, malformed documents, YAML alias expansion, link escape attempts, shell injection strings, and seeded secrets.
- CLI integration tests execute the compiled binary and verify text, JSON, stderr, and exit codes.
- A before/after filesystem snapshot proves `doctor` made no writes.
- Setup tests verify dry-run, explicit confirmation, ownership checks, modified-file refusal, and reversible uninstall.
- Release tests run `pnpm pack`, install the tarball in a temporary project, and execute the packed CLI.
- CI runs supported checks on Windows, macOS, and Linux.

## Acceptance Criteria

- A developer or agent can run `npx -y agent-hygiene@latest doctor --agent-mode` without Agent Hygiene configuration.
- Codex, Claude Code, and Hermes are detected using platform-appropriate roots and environment overrides.
- Every actionable finding contains evidence, impact, recommendation, and manual steps.
- JSON output validates against the versioned schema and contains no non-JSON stdout.
- Seeded secrets never appear in terminal output, JSON, verbose logs, or snapshots.
- `doctor` executes no discovered code and produces no writes.
- Failure in one adapter does not suppress successful results from other adapters.
- A Cursor adapter can be added by implementing `AgentAdapter` without modifying analyzers or reporters.
- `setup --yes` installs owned launcher skills, and `setup --uninstall` safely removes unchanged owned files.
- Tests, lint, type checking, build, and packed-package integration all pass.
- The README contains a prompt that can be pasted directly into an agent.

## Primary References

- OpenAI Codex configuration: <https://developers.openai.com/codex/config-reference>
- OpenAI Codex skills: <https://developers.openai.com/codex/skills>
- OpenAI Codex MCP: <https://developers.openai.com/codex/mcp>
- Anthropic Claude Code directory reference: <https://code.claude.com/docs/en/claude-directory>
- Anthropic Claude Code settings: <https://code.claude.com/docs/en/settings>
- Anthropic Claude Code skills: <https://code.claude.com/docs/en/skills>
- Anthropic Claude Code MCP: <https://code.claude.com/docs/en/mcp>
- Hermes path implementation: <https://github.com/NousResearch/hermes-agent/blob/main/hermes_constants.py>
- Hermes skills guide: <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md>
- Hermes MCP reference: <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/mcp-config-reference.md>
