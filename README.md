# Agent Hygiene CLI

Agent Hygiene CLI is an offline scanner and recovery tool for the local configuration surfaces of Codex, Claude Code, and Hermes. It inventories documented Skills, instructions, MCP definitions, extensions, and configuration files, then emits stable hygiene diagnostics.

## Status

Version `2.0.0` is ready for local installation and verification. It is not represented here as an npm-registry publication: use the repository checkout and the local commands below until a registry release is announced.

`doctor` is read-only. Version 2.0 renames the executable to `ahd` and retains a Codex-only interactive shortcut for recoverable removal; the existing operation-ID workflow remains available for automation.

## Requirements

- Node.js `22` or newer
- pnpm `10` or newer for development

## Local install and verification

From a repository checkout:

```bash
pnpm install --frozen-lockfile
pnpm check
node dist/cli/main.js doctor --agent codex
node dist/cli/main.js doctor --format json
```

To verify the packed artifact locally, without publishing it:

```bash
pnpm verify-pack
```

After `pnpm build`, the executable is available as `node dist/cli/main.js`. To install the local package globally, use `pnpm add -g .`, then run `ahd`; this is not an npm-registry release.

## Commands

### Doctor

`doctor` performs an offline scan and does not write to agent configuration, credentials, sessions, logs, caches, or project files.

```bash
ahd doctor
ahd doctor --format json
ahd doctor --agent codex --agent claude
ahd doctor --project ./my-project
ahd doctor --fail-on warning
ahd doctor --agent-mode
```

| Option | Meaning |
| --- | --- |
| `--agent <codex|claude|hermes>` | Limit the scan; repeatable. |
| `--project <path>` | Select a project directory. |
| `--format <terminal|json>` | Choose human or machine-readable output. |
| `--agent-mode` | Equivalent to non-interactive JSON output. |
| `--fail-on <error|warning>` | Select the failure threshold. |
| `--verbose` | Include additional diagnostic context. |

### Setup

`setup` is the explicit write command for the optional launcher Skill. Use `--dry-run` to preview actions. Write operations require explicit confirmation with `--yes`; `--force` and `--uninstall` are available for the corresponding lifecycle actions.

```bash
ahd setup --dry-run
ahd setup --yes
ahd setup --uninstall --yes
```

### Safe remove and restore

`remove` provides an explicit, recoverable workflow for user- and project-owned Skills and supported active MCP definitions. `doctor` remains read-only.

```bash
# Recommended for an interactive Codex cleanup: select with Space, then Enter
# immediately quarantines selected entries and prints a restore command.
ahd remove --codex

# Preview the selected Codex items without changing agent files
ahd remove --codex --dry-run

# Existing generic interaction still creates a plan; scripts can use exact IDs.
ahd remove
ahd remove --item <item-id> --item <item-id> --dry-run

# Apply a previously saved plan, with an explicit confirmation
ahd remove <operation-id> --yes

# Inspect safe operation summaries, or restore a completed operation
ahd operations
ahd restore <operation-id> --yes
```

Removal moves a whole Skill directory or the selected MCP configuration node into a private quarantine store. The command rescans and rechecks content fingerprints immediately before writing. If any target cannot be applied or verified, the operation is rolled back. Restore refuses to overwrite a path changed after removal.

Only user/project entries in an active or disabled state are eligible. Managed, plugin-owned, external, unresolved, and candidate entries are displayed in interactive mode but cannot be selected. JSON/JSONC, YAML, and TOML edits are source-range edits; unsupported syntax is refused rather than reformatted.

On Windows the quarantine store is under `%LOCALAPPDATA%\agent-hygiene\quarantine` (falling back to `%USERPROFILE%`); on POSIX it is under `~/.agent-hygiene/quarantine`. Operation manifests are private local recovery metadata and commands never display backup content or physical source paths.

## Safety model

- `doctor` is read-only after startup.
- `remove` and `restore` are the only additional mutation commands. The Codex-only `remove --codex` interactive path treats the final Enter as confirmation; all other mutations require an operation ID and `--yes`.
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
pnpm verify-pack
```

See [CHANGELOG.md](CHANGELOG.md) for release notes and [docs/MIGRATION-2.0.md](docs/MIGRATION-2.0.md) for upgrade notes.

## License

MIT. See [LICENSE](LICENSE).
