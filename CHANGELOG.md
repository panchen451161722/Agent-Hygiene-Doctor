# Changelog

All notable changes to Agent Hygiene CLI are documented in this file.

## 1.2.0 - 2026-07-13

### Added

- `agent-hygiene remove --codex`: a real-TTY Codex-only checkbox flow. Selecting items and pressing Enter creates a recoverable operation and immediately quarantines the selection in the same process.
- `--codex --dry-run` for interactively previewing selected Codex entries without changing agent files.

### Changed

- The package version is now `1.2.0`.
- Existing operation-ID removal, restore, and automation commands remain supported; the new shortcut still uses the same private quarantine, fingerprint validation, rollback, and restore protections.
## 1.1.0 - 2026-07-13

### Added

- Recoverable removal for eligible user- and project-owned Skills and supported MCP definitions.
- `remove`, `restore`, and `operations` commands, including interactive item selection and non-interactive operation IDs.
- A private quarantine store, operation manifests, pre-write fingerprints, rollback, and conflict-safe restore checks.
- Format-preserving MCP edits for JSON/JSONC, YAML, and TOML.
- Cross-platform continuous integration on Ubuntu and Windows, plus packed-artifact verification.

### Security

- Rejects managed, plugin-owned, system, external, unresolved, and candidate entries for removal.
- Refuses symlink/junction traversal, special files, stale plans, malformed manifests, and unsafe restore conflicts.
- Keeps report and operation output free of backup content and host-absolute source paths.

### Changed

- The package version is now `1.1.0`.
- README installation instructions now describe locally verifiable workflows and do not imply an npm-registry publication.
