# Migrating to 1.2

## Scope

Version 1.2 adds `agent-hygiene remove --codex`, an interactive shortcut for cleaning up eligible Codex Skills and MCP definitions. It does not permanently delete content: selected entries move to the same private quarantine used by the 1.1 operation workflow and can be restored by operation ID.

## Upgrade

1. Update the local checkout and run `pnpm install --frozen-lockfile`.
2. Run `pnpm check` and `pnpm verify-pack` before replacing a local installation.
3. If you use the optional launcher Skill, run `agent-hygiene setup --yes` after upgrading so its package pin is refreshed.

The runtime now reports version `1.2.0`.

## Codex interactive removal

Run the shortcut only in a real terminal:

```powershell
agent-hygiene remove --codex
```

Use Space to choose eligible Codex items and Enter to confirm. The command creates an operation and immediately applies it, then prints an ID and the corresponding recovery command:

```powershell
agent-hygiene restore <operation-id> --yes
```

`agent-hygiene remove --codex --dry-run` lets you select items but does not alter agent files. The shortcut rejects non-interactive input and incompatible automation flags. Managed, plugin-owned, external, unresolved, and candidate entries remain unselectable.

## Existing automation

The operation-ID workflow is unchanged:

```powershell
agent-hygiene remove --item <item-id> --dry-run
agent-hygiene remove <operation-id> --yes
agent-hygiene restore <operation-id> --yes
```

Use this workflow for scripts or for agents other than Codex. Treat operation IDs and quarantine manifests as local recovery data; do not copy them between machines.