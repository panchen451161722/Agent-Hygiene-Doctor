# Migrating to 2.0

## Breaking change

The installed executable has changed from `agent-hygiene` to `ahd`. The npm package name remains `agent-hygiene-cli`.

```powershell
pnpm add -g agent-hygiene-cli@2
ahd --version
ahd doctor
```

Update scripts, CI jobs, shell aliases, and documentation to invoke `ahd`. The `agent-hygiene` executable is no longer installed by version 2.

## Compatibility

This command rename does not migrate or delete local data. Existing Skill locations, quarantine directories, operation IDs, removal transactions, restore semantics, and JSON report tool identifiers remain compatible.

Use existing operations with the new executable:

```powershell
ahd operations
ahd restore <operation-id> --yes
```

If an older launcher Skill is installed, rerun setup after upgrading:

```powershell
ahd setup --yes
```

## Verification

On Windows, verify the command resolved from PATH before using it:

```powershell
Get-Command ahd
ahd --version
ahd doctor --agent codex
```

Do not delete an unknown `agent-hygiene` shim manually. First identify whether it belongs to an older global installation or another package.