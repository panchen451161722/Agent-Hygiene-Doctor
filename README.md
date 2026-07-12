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

## Safety model

- `doctor` is read-only after startup.
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
pnpm pack --pack-destination .pack
```

## License

MIT
