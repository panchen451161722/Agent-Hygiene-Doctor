# Migrating to 1.1

## Scope

Agent Hygiene CLI 1.1 keeps `doctor` read-only and adds an opt-in, recoverable workflow for removing eligible Skills and MCP definitions. Existing `doctor` automation continues to work with the same command shape.

## Upgrade

1. Update the local checkout, then run `pnpm install --frozen-lockfile`.
2. Run `pnpm check` and `pnpm verify-pack` before replacing an existing local installation.
3. Run `agent-hygiene doctor --format json` to record the current inventory before planning any removals.

The runtime now reports version `1.1.0`. If you use the launcher produced by `setup`, rerun `agent-hygiene setup --yes` after upgrading so its exact package pin is refreshed.

## Removal workflow

Removal is deliberately two phase:

1. Create or inspect a plan with `agent-hygiene remove` or `agent-hygiene remove --item <item-id> --dry-run`.
2. Apply exactly that plan with `agent-hygiene remove <operation-id> --yes`.
3. Inspect it with `agent-hygiene operations`, or undo it with `agent-hygiene restore <operation-id> --yes`.

The tool only permits active or disabled user/project entries. It moves eligible Skill content and selected MCP entries to a private quarantine store rather than permanently deleting them. Restore refuses to overwrite content that changed after removal.

## Automation notes

- Non-interactive mutations require both an operation ID and `--yes`.
- Treat operation IDs as local recovery references; do not copy quarantine files or manifests between machines.
- Continue consuming `doctor --format json` as JSON only. Do not parse human terminal output.
- There is no registry publication implied by this document; validate a checkout with `node dist/cli/main.js` or `pnpm verify-pack`.
