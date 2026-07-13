# Agent Hygiene CLI

Agent Hygiene CLI is a deterministic, read-only scanner for the local configuration surfaces of Codex, Claude Code, and Hermes. It inventories documented skills, instructions, MCP definitions, extensions, and configuration files, then emits stable hygiene diagnostics.

## Status

Version `0.1.0` is an implementation preview. The `doctor` command supports terminal and JSON reports, agent filtering, explicit project roots, machine-readable agent mode, and configurable failure thresholds. Broader agent-specific discovery and release validation are still being expanded.

## Requirements

- Node.js `22` or newer
- pnpm

## Install and build

```bash
npm install -g agent-hygiene-cli
```

The package exposes one executable: `agent-hygiene`.

## Commands

### Doctor

`doctor` performs an offline scan and does not write to agent configuration, credentials, sessions, logs, caches, or project files.

```bash
agent-hygiene doctor
agent-hygiene doctor --format json
agent-hygiene doctor --agent codex --agent claude
agent-hygiene doctor --project ./my-project
agent-hygiene doctor --fail-on warning
agent-hygiene doctor --agent-mode
```

Useful options:

| Option | Meaning |
| --- | --- |
| `--agent <codex|claude|hermes>` | Limit the scan; repeatable. |
| `--project <path>` | Select a project directory. |
| `--format <terminal|json>` | Choose human or machine-readable output. |
| `--agent-mode` | Equivalent to non-interactive JSON output. |
| `--fail-on <error|warning>` | Select the failure threshold. |
| `--verbose` | Include additional diagnostic context. |

### Setup

`setup` is the explicit write command for the optional launcher skill. Use `--dry-run` to preview actions. Write operations require explicit confirmation with `--yes`; `--force` and `--uninstall` are available for the corresponding lifecycle actions.

```bash
agent-hygiene setup --dry-run
agent-hygiene setup --yes
agent-hygiene setup --uninstall --yes
```

### Safe remove and restore

Version 1.1 adds an explicit, recoverable removal workflow for user- and project-owned Skills and supported active MCP definitions. `doctor` remains read-only.

```bash
# Interactive checkbox selection; this only creates a plan
agent-hygiene remove

# Non-interactive plan generation from exact inventory IDs
agent-hygiene remove --item <item-id> --item <item-id> --dry-run

# Apply only a saved plan, with an explicit confirmation
agent-hygiene remove <operation-id> --yes

# Inspect safe operation summaries, or restore a completed operation
agent-hygiene operations
agent-hygiene restore <operation-id> --yes
```

Removal moves a whole Skill directory or the selected MCP configuration node into a private quarantine store. The command rescans and rechecks content fingerprints immediately before writing. If any target cannot be applied or verified, the operation is rolled back. Restore refuses to overwrite a path changed after removal.

Only user/project entries in an active or disabled state are eligible. Managed, plugin-owned, external, unresolved, and candidate entries are displayed in interactive mode but cannot be selected. JSON/JSONC, YAML, and TOML edits are source-range edits; unsupported syntax is refused rather than reformatted.

On Windows the quarantine store is under `%LOCALAPPDATA%\agent-hygiene\quarantine` (falling back to `%USERPROFILE%`); on POSIX it is under `~/.agent-hygiene/quarantine`. Operation manifests are private local recovery metadata and commands never display backup content or physical source paths.
## Safety model

- `doctor` is read-only after startup.
- `remove` and `restore` are the only additional mutation commands; both require an operation ID and `--yes` before agent files change.
- All reads pass through an injected, bounded filesystem boundary.
- Paths are segment-checked, canonicalized, and checked for ancestor symlink/junction escapes.
- Only regular files and directories are traversed; special files are rejected.
- Reads, directory entries, link hops, parser depth, parser nodes, and concurrency are capped by versioned scan limits.
- Parser diagnostics never expose library errors, source excerpts, stacks, or credential values.
- Reports expose root-relative `SourceRef` values rather than host absolute paths.
- Ordinary strings and undocumented references are not promoted into content roots.

The scanner is designed for accidental misconfiguration and does not claim protection against a hostile same-user process mutating files during a scan.

## Development

Run the complete local verification suite:

```bash
pnpm check
```

The check runs ESLint, TypeScript type checking, Vitest, and the production build. To inspect package contents:

```bash
pnpm build
pnpm verify-pack
# Optional: inspect the generated archive manually
pnpm pack --pack-destination .pack
```

## License

MIT
