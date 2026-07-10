# Agent Hygiene CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package Agent Hygiene 0.1 as a deterministic, read-only Node.js CLI that inventories Codex, Claude Code, and Hermes installations, reports hygiene findings, and safely manages an optional launcher skill.

**Architecture:** A host-only CLI builds an immutable injected scan context, runs independent agent adapters through a bounded filesystem boundary, maps typed inventory facts and diagnostics through generic rule analyzers, and serializes one closed `ReportV1` DTO. `doctor` is offline and read-only after process startup; `setup` is a separate, explicitly confirmed write path with two-file ownership verification.

**Tech Stack:** TypeScript, Node.js 22+, ESM, pnpm, Commander, YAML, smol-toml, picocolors, Vitest, ESLint, Ajv (schema tests only), GitHub Actions.

---

## Delivery shape

The plan is one vertical release plan because every subsystem feeds the same executable and report contract. Tasks 1-8 establish a working core with fake adapters, tasks 9-11 add the three independently testable adapters, and tasks 12-14 complete CLI UX, setup, packaging, and documentation. Every task ends with targeted tests and a commit; no adapter task depends on another adapter task.

## File map

### Project and release files

- `package.json`: package identity, Node engine, single `agent-hygiene` bin, scripts, and publish allowlist.
- `pnpm-lock.yaml`: reproducible dependency graph.
- `tsconfig.json`, `tsconfig.build.json`: strict development and emitted-build configurations.
- `eslint.config.js`, `vitest.config.ts`: lint and test configuration.
- `schema/report-v1.schema.json`: closed public JSON schema.
- `scripts/verify-pack.mjs`: packed-tarball installation and execution check.
- `.github/workflows/ci.yml`: Windows, macOS, and Linux checks.
- `README.md`, `LICENSE`: user prompt, safety boundaries, CLI reference, and MIT license.

### Runtime files

- `src/cli/main.ts`: executable entry point and exit-code boundary.
- `src/cli/options.ts`: argument parsing and validation only.
- `src/cli/doctor.ts`: doctor command composition.
- `src/cli/setup.ts`: setup command composition.
- `src/core/agent.ts`, `coverage.ts`, `limits.ts`: stable enums and limits.
- `src/core/source-ref.ts`, `root-registry.ts`, `path-dialect.ts`: internal absolute roots and public root-relative references.
- `src/core/context.ts`, `project-root.ts`: immutable environment snapshot and project selection.
- `src/core/inventory.ts`, `diagnostic.ts`, `finding.ts`, `report.ts`: closed internal/report DTOs and deterministic builders.
- `src/core/fs/backend.ts`, `path-policy.ts`, `budget.ts`, `safe-fs.ts`: bounded, injected filesystem implementation.
- `src/core/parsers/json.ts`, `yaml.ts`, `toml.ts`, `limits.ts`: sanitized parser boundary.
- `src/core/redaction.ts`: final defense-in-depth redaction.
- `src/core/adapter.ts`, `orchestrator.ts`: adapter contract, failure isolation, and coverage aggregation.
- `src/rules/catalog.ts`, `normalization.ts`, `ids.ts`, `executable.ts`, `package-spec.ts`, `mcp-fingerprint.ts`, `manual-steps.ts`: deterministic rule primitives.
- `src/inspectors/skill.ts`, `instruction.ts`, `mcp.ts`, `extension.ts`: shared artifact-to-fact projection.
- `src/analyzers/*.ts`: generic analyzers for configuration, filesystem, skills, MCP, context, extensions, and cross-agent duplicates.
- `src/adapters/codex/*.ts`, `claude/*.ts`, `hermes/*.ts`: agent-specific roots, precedence, activation, discovery, and projection.
- `src/reporters/json.ts`, `terminal.ts`: pure report renderers.
- `src/setup/destinations.ts`, `launcher.ts`, `manifest.ts`, `safe-write.ts`: owned launcher-skill lifecycle.

### Tests

- `test/unit/**`: pure rule, DTO, parser, path, and setup tests.
- `test/contract/**`: adapter and report-schema contracts.
- `test/integration/**`: real filesystem, compiled CLI, no-write snapshot, and pack tests.
- `test/fixtures/{codex,claude,hermes,security}/**`: simulated Windows/POSIX agent trees and seeded-secret cases.

## Task 1: Scaffold the package and argument boundary

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `eslint.config.js`
- Create: `vitest.config.ts`
- Create: `src/cli/options.ts`
- Create: `src/cli/main.ts`
- Create: `test/unit/cli/options.test.ts`

- [ ] **Step 1: Create package metadata and tool configuration**

Set `name` to `agent-hygiene-cli`, `version` to `0.1.0`, `type` to `module`, `engines.node` to `>=22`, and declare exactly one bin:

```json
{
  "bin": { "agent-hygiene": "./dist/cli/main.js" },
  "files": ["dist", "schema", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

Install runtime dependencies with `pnpm add commander yaml smol-toml picocolors` and development dependencies with `pnpm add -D typescript vitest @types/node eslint typescript-eslint ajv`.

- [ ] **Step 2: Write failing option-parser tests**

```ts
import { describe, expect, it } from "vitest";
import { parseCliOptions } from "../../../src/cli/options.js";

describe("parseCliOptions", () => {
  it("turns agent mode into non-interactive JSON", () => {
    expect(parseCliOptions(["doctor", "--agent-mode"])).toMatchObject({
      command: "doctor",
      format: "json",
      interactive: false,
      color: false,
    });
  });

  it("rejects an unsupported agent", () => {
    expect(() => parseCliOptions(["doctor", "--agent", "cursor"]))
      .toThrowError("AH-CLI-INVALID-AGENT");
  });
});
```

- [ ] **Step 3: Run the test and verify red**

Run: `pnpm exec vitest run test/unit/cli/options.test.ts`

Expected: FAIL because `src/cli/options.ts` does not exist.

- [ ] **Step 4: Implement the minimal typed parser and executable shell**

`parseCliOptions` must support `doctor`, `setup`, `--agent codex|claude|hermes` (repeatable), `--project`, `--format terminal|json`, `--agent-mode`, `--fail-on error|warning`, `--verbose`, `--dry-run`, `--yes`, `--force`, and `--uninstall`. Export a discriminated `CliOptions` union. `main.ts` gets a shebang, catches only cataloged CLI errors, writes fatal errors to stderr, and sets `process.exitCode = 2`; it must not implement scanning yet.

- [ ] **Step 5: Verify green and project checks**

Run: `pnpm exec vitest run test/unit/cli/options.test.ts && pnpm typecheck && pnpm lint`

Expected: 2 tests pass; typecheck and lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json eslint.config.js vitest.config.ts src/cli test/unit/cli
git commit -m "chore: scaffold Agent Hygiene CLI"
```

## Task 2: Define the closed report model and JSON schema

**Files:**
- Create: `src/core/agent.ts`
- Create: `src/core/coverage.ts`
- Create: `src/core/limits.ts`
- Create: `src/core/source-ref.ts`
- Create: `src/core/inventory.ts`
- Create: `src/core/diagnostic.ts`
- Create: `src/core/finding.ts`
- Create: `src/core/report.ts`
- Create: `schema/report-v1.schema.json`
- Create: `test/unit/core/report.test.ts`
- Create: `test/contract/report-schema.test.ts`

- [ ] **Step 1: Write failing deterministic-report tests**

```ts
it("sorts report arrays and recomputes summaries", () => {
  const report = buildReport(fixtureWithReversedArrays());
  expect(report.schemaVersion).toBe(1);
  expect(report.inventory.map((item) => item.itemId)).toEqual(expectedInventoryOrder);
  expect(report.summary.findings.warning).toBe(1);
});

it("never accepts a raw Error as a diagnostic", () => {
  expect(() => buildReport({ ...validInput, diagnostics: [new Error("SECRET")] }))
    .toThrowError("AH-REPORT-INVALID-DIAGNOSTIC");
});
```

- [ ] **Step 2: Run the report tests and verify red**

Run: `pnpm exec vitest run test/unit/core/report.test.ts`

Expected: FAIL because the report types and builder do not exist.

- [ ] **Step 3: Implement the spec DTOs and deterministic builder**

Use literal unions from the design, frozen `SCAN_LIMITS_V1`, SHA-256 lowercase ids, fixed agent order `codex`, `claude`, `hermes`, and explicit sort comparators. `buildReport` accepts internal arrays, validates typed boundaries, aggregates coverage with `unknown > partial > complete`, recomputes counts, and returns `Readonly<ReportV1>`.

- [ ] **Step 4: Add the closed JSON Schema and contract test**

Create Draft 2020-12 schema definitions for every object and union, require applicable properties, set `additionalProperties: false` everywhere, and validate a built fixture with Ajv:

```ts
const validate = ajv.compile(reportSchema);
expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
expect(validate({ ...report, surprise: true })).toBe(false);
```

- [ ] **Step 5: Verify targeted and schema tests**

Run: `pnpm exec vitest run test/unit/core/report.test.ts test/contract/report-schema.test.ts && pnpm typecheck`

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/core schema test/unit/core/report.test.ts test/contract/report-schema.test.ts
git commit -m "feat: define versioned report contract"
```

## Task 3: Build injected path, root, and scan context primitives

**Files:**
- Create: `src/core/path-dialect.ts`
- Create: `src/core/root-registry.ts`
- Create: `src/core/context.ts`
- Create: `src/core/project-root.ts`
- Create: `test/unit/core/path-dialect.test.ts`
- Create: `test/unit/core/root-registry.test.ts`
- Create: `test/unit/core/context.test.ts`

- [ ] **Step 1: Write failing Windows/POSIX containment tests**

```ts
it("rejects a Windows sibling prefix", () => {
  expect(win32Dialect.contains("C:\\agent", "C:\\agent-old\\x")).toBe(false);
});

it("renders only a root alias and slash-relative path", () => {
  const roots = RootRegistry.forTest(win32Dialect, [
    { id: "codex-home", alias: "$CODEX_HOME", absolutePath: "C:\\Users\\u\\.codex" },
  ]);
  expect(roots.toSourceRef("codex-home", "C:\\Users\\u\\.codex\\config.toml"))
    .toEqual({ rootId: "codex-home", relativePath: "config.toml" });
});
```

- [ ] **Step 2: Run the path tests and verify red**

Run: `pnpm exec vitest run test/unit/core/path-dialect.test.ts test/unit/core/root-registry.test.ts`

Expected: FAIL because path and registry modules do not exist.

- [ ] **Step 3: Implement dialect and root registry**

Wrap `node:path/posix` and `node:path/win32` behind `PathDialect`. Reject NUL, Windows device namespaces, ADS, drive-relative paths, cross-drive comparisons, and incompatible UNC roots. Assign semantic root ids first (`project`, `home`, `codex-home`, `claude-home`, `hermes-home`, managed slots), then deterministic external ordinals after internally sorting canonical paths. Never expose `absolutePath` from the registry's report-facing methods.

- [ ] **Step 4: Implement immutable context and project selection**

`createScanContext` snapshots only documented variables (`HOME`, `USERPROFILE`, `LOCALAPPDATA`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `HERMES_HOME`, `HERMES_ENABLE_PROJECT_PLUGINS`, `PATH`, `PATHEXT`), injected platform/dialect, clock, version, and filesystem. `findGenericProjectRoot` walks ancestors using metadata only and chooses the nearest `.git` file/directory without executing Git.

- [ ] **Step 5: Verify all context tests**

Run: `pnpm exec vitest run test/unit/core/path-dialect.test.ts test/unit/core/root-registry.test.ts test/unit/core/context.test.ts && pnpm typecheck`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/path-dialect.ts src/core/root-registry.ts src/core/context.ts src/core/project-root.ts test/unit/core
git commit -m "feat: add injected scan context"
```

## Task 4: Enforce the bounded filesystem boundary

**Files:**
- Create: `src/core/fs/backend.ts`
- Create: `src/core/fs/semaphore.ts`
- Create: `src/core/fs/path-policy.ts`
- Create: `src/core/fs/budget.ts`
- Create: `src/core/fs/safe-fs.ts`
- Create: `test/unit/core/fs/path-policy.test.ts`
- Create: `test/unit/core/fs/budget.test.ts`
- Create: `test/integration/safe-fs.test.ts`

- [ ] **Step 1: Write failing escape, special-file, and budget tests**

Cover: sibling-prefix escapes, ancestor symlink escapes, an in-root symlink, junction/reparse metadata in the fake Windows backend, a file that grows beyond `maxFileBytes` after metadata lookup, deterministic sorted traversal, depth/count/byte exhaustion, a FIFO/special-file result, and 32 simultaneous reads whose instrumented backend peak must never exceed 8.

```ts
it("reads at most maxFileBytes + 1 through the opened handle", async () => {
  const result = await safeFs.readText(root, "growing.txt");
  expect(result).toMatchObject({ ok: false, diagnostic: { code: "limit_exceeded" } });
  expect(backend.bytesRead).toBe(SCAN_LIMITS_V1.maxFileBytes + 1);
});
```

- [ ] **Step 2: Run filesystem tests and verify red**

Run: `pnpm exec vitest run test/unit/core/fs test/integration/safe-fs.test.ts`

Expected: FAIL because the safe filesystem does not exist.

- [ ] **Step 3: Implement backend and path-policy layers**

Define an injectable `FsBackend` with `lstat`, `realpath`, `openRegularFile`, `readDirectory`, and handle `stat/read/close`. Check every existing component before following a link, cap link hops at 8, canonicalize targets, and require segment-aware containment in the admitted root. Metadata-only executable checks must never promote a command path into a content root.

- [ ] **Step 4: Implement deterministic independent budgets**

Use a fresh `RootBudget` per admitted root and an `AdapterBudget` per adapter. Create one fair `ScanIoSemaphore(8)` in `ScanContext` and inject the same instance into every adapter's `SafeFileSystem`; acquire it around every backend metadata, directory, open, read, and close operation so nested adapter work cannot exceed eight concurrent filesystem operations. Adapter concurrency remains a separate orchestrator concern. Sort normalized entry names before spending budget. On exhaustion, emit one cataloged `limit_exceeded` diagnostic, return coverage `partial`, and stop only that scope. Limit reads to regular files and the exact file descriptor; discard partial content on overflow.

- [ ] **Step 5: Verify filesystem tests and leak checks**

Run: `pnpm exec vitest run test/unit/core/fs test/integration/safe-fs.test.ts && pnpm typecheck`

Expected: all tests pass; no test output contains fixture secret values.

- [ ] **Step 6: Commit**

```bash
git add src/core/fs test/unit/core/fs test/integration/safe-fs.test.ts
git commit -m "feat: enforce safe filesystem boundaries"
```

## Task 5: Add sanitized bounded parsers and final redaction

**Files:**
- Create: `src/core/parsers/types.ts`
- Create: `src/core/parsers/limits.ts`
- Create: `src/core/parsers/json.ts`
- Create: `src/core/parsers/yaml.ts`
- Create: `src/core/parsers/toml.ts`
- Create: `src/core/redaction.ts`
- Create: `test/unit/core/parsers.test.ts`
- Create: `test/unit/core/redaction.test.ts`
- Create: `test/fixtures/security/parser-secrets.*`

- [ ] **Step 1: Write failing parser privacy tests**

Seed a secret in malformed JSON/YAML/TOML and assert that returned diagnostics contain only `code`, `source`, optional `line`/`column`, severity, coverage impact, and a cataloged message. Add depth, node-count, YAML-alias, invalid UTF-8, and 1 MiB boundary cases.

```ts
expect(JSON.stringify(parseResult)).not.toContain("seeded-super-secret");
expect(parseResult).toMatchObject({
  ok: false,
  diagnostic: expect.objectContaining({ code: "parse_error" }),
});
```

- [ ] **Step 2: Run parser tests and verify red**

Run: `pnpm exec vitest run test/unit/core/parsers.test.ts test/unit/core/redaction.test.ts`

Expected: FAIL because parser modules do not exist.

- [ ] **Step 3: Implement parser boundary**

Accept UTF-8 with optional BOM only. JSON and TOML parse under the 1 MiB read limit, then walk the resulting value iteratively to enforce 64 nesting levels and 100,000 nodes. YAML must parse to a document without expanding aliases first, enforce 50 aliases and node/depth budgets, then project. Catch library exceptions inside each module and map only safe location data; never pass `error.message`, source excerpts, parsed raw documents, or stacks outward.

- [ ] **Step 4: Implement allowlist projection helpers and final redaction**

Provide helpers for safe booleans, numbers, enum strings, environment names, field names, and typed path references. `redactOutput` is defense in depth for cataloged strings and replaces credential-pattern literals without being the primary privacy boundary.

- [ ] **Step 5: Verify parser, secret, and type tests**

Run: `pnpm exec vitest run test/unit/core/parsers.test.ts test/unit/core/redaction.test.ts && pnpm typecheck`

Expected: all tests pass and seeded secrets are absent from snapshots/output.

- [ ] **Step 6: Commit**

```bash
git add src/core/parsers src/core/redaction.ts test/unit/core test/fixtures/security
git commit -m "feat: add sanitized configuration parsers"
```

## Task 6: Implement deterministic normalization and security rule primitives

**Files:**
- Create: `src/rules/normalization.ts`
- Create: `src/rules/ids.ts`
- Create: `src/rules/executable.ts`
- Create: `src/rules/package-spec.ts`
- Create: `src/rules/mcp-fingerprint.ts`
- Create: `src/rules/token-estimate.ts`
- Create: `test/unit/rules/normalization.test.ts`
- Create: `test/unit/rules/ids.test.ts`
- Create: `test/unit/rules/executable.test.ts`
- Create: `test/unit/rules/package-spec.test.ts`
- Create: `test/unit/rules/mcp-fingerprint.test.ts`

- [ ] **Step 1: Write failing table-driven tests**

Test BOM/line-ending/NFC/trailing-whitespace normalization, ASCII-only name folding, stable lowercase SHA-256 ids, POSIX executable bits, Windows case-insensitive `PATHEXT`, empty-PATH `unknown`, exact semver/full-commit pins, runner aliases, credential flags, query-value removal, URL userinfo removal, and high-entropy path replacement.

```ts
expect(fingerprintMcp(urlWithSecret("alpha")))
  .toBe(fingerprintMcp(urlWithSecret("beta")));
expect(JSON.stringify(fingerprintInput(urlWithSecret("alpha"))))
  .not.toContain("alpha");
```

- [ ] **Step 2: Run rule-primitive tests and verify red**

Run: `pnpm exec vitest run test/unit/rules`

Expected: FAIL because the rule primitives do not exist.

- [ ] **Step 3: Implement text, name, id, and token primitives**

Implement the exact design normalization sequence and `Math.ceil([...text].length / 4)`. Build ids from stable JSON tuples, never object insertion order. Keep all raw absolute paths and content inside the calling scope; return hashes only.

- [ ] **Step 4: Implement executable, package, and MCP primitives**

Executable resolution uses only injected cwd, filesystem metadata, `PATH`, and `PATHEXT`; unsupported semantics return `unknown`. Package recognition covers `npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, and `bunx`. MCP fingerprints retain only safe command/argument shapes, recognized package specs, option names, sorted environment names, normalized URL host/path shape, and query names.

- [ ] **Step 5: Verify all primitive tests**

Run: `pnpm exec vitest run test/unit/rules && pnpm typecheck && pnpm lint`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/rules test/unit/rules
git commit -m "feat: add deterministic rule primitives"
```

## Task 7: Project shared artifacts into typed facts

**Files:**
- Create: `src/inspectors/skill.ts`
- Create: `src/inspectors/instruction.ts`
- Create: `src/inspectors/mcp.ts`
- Create: `src/inspectors/extension.ts`
- Create: `test/unit/inspectors/skill.test.ts`
- Create: `test/unit/inspectors/instruction.test.ts`
- Create: `test/unit/inspectors/mcp.test.ts`
- Create: `test/unit/inspectors/extension.test.ts`

- [ ] **Step 1: Write failing fact-projection tests**

Use already-sanitized parser projections. Verify malformed/missing skill frontmatter, agent-provided effective-name rules, exact normalized instruction fingerprints, loading categories, credential-like field names without values, MCP URL/command classes, extension activation, and estimated-token labeling.

```ts
const item = inspectMcp(projectedMcpWithInlineToken, context);
expect(item.facts).toMatchObject({
  type: "mcp",
  credentialLikeFields: ["authorization"],
});
expect(JSON.stringify(item)).not.toContain("actual-token");
```

- [ ] **Step 2: Run inspector tests and verify red**

Run: `pnpm exec vitest run test/unit/inspectors`

Expected: FAIL because inspectors do not exist.

- [ ] **Step 3: Implement focused pure inspectors**

Each inspector accepts `SourceRef`, agent/scope/status/loading decisions from the adapter, and a whitelisted projected object. It returns exactly one discriminated `InventoryItem` or a typed diagnostic. Inspectors do not perform discovery, read host globals, decide precedence, or emit findings.

- [ ] **Step 4: Add item-id and privacy assertions**

Generate `itemId` only after canonical effective name and source are known. Add a recursive test helper that rejects keys named `raw`, `error`, `stack`, `absolutePath`, or credential-value variants in every inventory item.

- [ ] **Step 5: Verify inspectors**

Run: `pnpm exec vitest run test/unit/inspectors test/unit/rules && pnpm typecheck`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/inspectors test/unit/inspectors
git commit -m "feat: project artifacts into safe inventory facts"
```

## Task 8: Add rule catalog, analyzers, and orchestrator isolation

**Files:**
- Create: `src/core/adapter.ts`
- Create: `src/core/orchestrator.ts`
- Create: `src/rules/catalog.ts`
- Create: `src/rules/manual-steps.ts`
- Create: `src/analyzers/configuration.ts`
- Create: `src/analyzers/filesystem.ts`
- Create: `src/analyzers/skills.ts`
- Create: `src/analyzers/mcp.ts`
- Create: `src/analyzers/context.ts`
- Create: `src/analyzers/extensions.ts`
- Create: `src/analyzers/cross-agent.ts`
- Create: `src/analyzers/index.ts`
- Create: `test/unit/analyzers/*.test.ts`
- Create: `test/unit/core/orchestrator.test.ts`

- [ ] **Step 1: Write failing analyzer tests for every rule id**

Create one positive and one negative fixture for `AH-CFG-001..003`, `AH-FS-001..002`, `AH-SKL-001..005`, `AH-MCP-001..005`, `AH-CTX-001..003`, `AH-EXT-001`, and `AH-XAG-001`. Explicitly verify no absence-based finding under partial/unknown coverage, no duplicate generic context warning when a documented Codex threshold applies, and deterministic `instanceId` ordering.

- [ ] **Step 2: Write failing orchestrator isolation tests**

```ts
const result = await orchestrate([successfulAdapter, throwingAdapter], context);
expect(result.adapters).toEqual([
  expect.objectContaining({ agent: "codex", status: "complete" }),
  expect.objectContaining({ agent: "claude", status: "failed" }),
]);
expect(JSON.stringify(result)).not.toContain("throwing adapter secret");
```

- [ ] **Step 3: Run analyzer/orchestrator tests and verify red**

Run: `pnpm exec vitest run test/unit/analyzers test/unit/core/orchestrator.test.ts`

Expected: FAIL because catalog, analyzers, and orchestrator do not exist.

- [ ] **Step 4: Implement the closed catalog and generic analyzers**

Catalog entries own rule id, severity, category, title/impact/recommendation templates, confidence, actionability, and platform-safe manual-step generators. Analyzers consume only typed facts, diagnostics, and coverage; they contain no `if (agent === ...)` branches. Agent-specific validity/precedence must already be encoded by adapters.

- [ ] **Step 5: Implement adapter results and orchestration**

Run adapters with concurrency capped at the scan limit, isolate detection/discovery/inspection failures, discard original errors, aggregate adapter/component coverage, invoke analyzers once on the normalized combined inventory, then build `ReportV1`. A missing agent is `not-detected`, not failed.

- [ ] **Step 6: Verify all rules and isolation**

Run: `pnpm exec vitest run test/unit/analyzers test/unit/core/orchestrator.test.ts test/contract/report-schema.test.ts && pnpm typecheck`

Expected: every rule-id test and isolation test passes.

- [ ] **Step 7: Commit**

```bash
git add src/core/adapter.ts src/core/orchestrator.ts src/rules/catalog.ts src/rules/manual-steps.ts src/analyzers test/unit/analyzers test/unit/core/orchestrator.test.ts
git commit -m "feat: analyze normalized agent inventory"
```

## Task 9: Implement the Codex adapter

**Files:**
- Create: `src/adapters/codex/roots.ts`
- Create: `src/adapters/codex/config.ts`
- Create: `src/adapters/codex/instructions.ts`
- Create: `src/adapters/codex/adapter.ts`
- Create: `test/contract/codex-adapter.test.ts`
- Create: `test/fixtures/codex/posix/**`
- Create: `test/fixtures/codex/windows/**`

- [ ] **Step 1: Build failing Codex contract fixtures**

Fixtures must cover `CODEX_HOME`, default home, selected and candidate profiles, user and every root-to-CWD `.codex/config.toml`/`hooks.json`, trust known/unknown, global and layered `AGENTS.override.md`/`AGENTS.md`/fallbacks, every root-to-CWD `.agents/skills`, user/admin/plugin skills, explicit skill disablement, MCP definitions, duplicate same-name active skills, malformed TOML, and a system-bundled-skills coverage gap.

- [ ] **Step 2: Write failing contract assertions**

Assert stable `SourceRef` paths, precedence/status/loading, 32 KiB default `project_doc_max_bytes`, closest instruction order, trust-gated unresolved project config, both same-name skills remaining active, disabled skills, hooks/extensions, MCP facts, sanitized malformed-config findings, and complete/partial component coverage.

- [ ] **Step 3: Run the Codex contract and verify red**

Run: `pnpm exec vitest run test/contract/codex-adapter.test.ts`

Expected: FAIL because the Codex adapter does not exist.

- [ ] **Step 4: Implement Codex roots and projected configuration**

Detection succeeds when an explicit effective home, documented project artifact, or metadata-only resolvable Codex executable exists. Resolve generic/Codex project roots without executing Codex. Parse only whitelisted `profile`, `project_root_markers`, `project_doc_*`, trust, MCP, skills, plugins, and hook fields. Candidate profiles remain unresolved unless selected statically.

- [ ] **Step 5: Implement discovery, precedence, and loading**

Walk every documented layer in deterministic root-to-CWD order. Apply global instruction override selection and at-most-one project instruction per directory. Keep same-name Codex skills active unless explicitly disabled. Mark project `.codex` sources unresolved when trust cannot be established. Never inspect auth, sessions, logs, or undocumented runtime state.

- [ ] **Step 6: Verify Codex and generic rules**

Run: `pnpm exec vitest run test/contract/codex-adapter.test.ts test/unit/analyzers test/contract/report-schema.test.ts && pnpm typecheck`

Expected: Codex contract and downstream analyzer/schema tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/codex test/contract/codex-adapter.test.ts test/fixtures/codex
git commit -m "feat: inspect Codex environments"
```

## Task 10: Implement the Claude Code adapter

**Files:**
- Create: `src/adapters/claude/roots.ts`
- Create: `src/adapters/claude/settings.ts`
- Create: `src/adapters/claude/instructions.ts`
- Create: `src/adapters/claude/plugins.ts`
- Create: `src/adapters/claude/adapter.ts`
- Create: `test/contract/claude-adapter.test.ts`
- Create: `test/fixtures/claude/posix/**`
- Create: `test/fixtures/claude/windows/**`

- [ ] **Step 1: Build failing Claude contract fixtures**

Cover `CLAUDE_CONFIG_DIR`, user/project/local settings, managed `managed-settings.d` and base file, managed MCP, root `.mcp.json`, documented `~/.claude.json` MCP/project approval projections, user/project/plugin skills and rules, `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, five-hop `@` imports, disabled/model-invocation skill state, installed-plugin manifests/components, excluded plugin data, malformed JSON, and unreadable managed sources.

- [ ] **Step 2: Write failing precedence and privacy assertions**

Verify managed > unresolved CLI > local project > project > user scalar precedence; documented array merge/deduplication; project MCP approval unresolved where appropriate; subdirectory instructions conditional; imports unresolved when approval is unknown; plugin persistent data, transcripts, history, snapshots, and memory never appear in read traces or reports.

- [ ] **Step 3: Run the Claude contract and verify red**

Run: `pnpm exec vitest run test/contract/claude-adapter.test.ts`

Expected: FAIL because the Claude adapter does not exist.

- [ ] **Step 4: Implement Claude settings and source discovery**

Use only documented filesystem locations and typed exact-file imports. Never read registry, MDM services, remote settings, or execute `policyHelper`. Project `.mcp.json` is at project root; `.claude.json` remains a separately admitted exact file and is projected only through documented MCP/approval keys.

- [ ] **Step 5: Implement activation, loading, and plugin projection**

Encode precedence and documented array semantics in adapter facts. Inspect plugin manifests and active component roots but exclude `plugins/data`, transcripts, snapshots, cache payloads unrelated to active components, and auto-memory. Cap imports at five hops through `SafeFileSystem`.

- [ ] **Step 6: Verify Claude and generic rules**

Run: `pnpm exec vitest run test/contract/claude-adapter.test.ts test/unit/analyzers test/contract/report-schema.test.ts && pnpm typecheck`

Expected: Claude contract and downstream tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/claude test/contract/claude-adapter.test.ts test/fixtures/claude
git commit -m "feat: inspect Claude Code environments"
```

## Task 11: Implement the Hermes adapter

**Files:**
- Create: `src/adapters/hermes/roots.ts`
- Create: `src/adapters/hermes/config.ts`
- Create: `src/adapters/hermes/skills.ts`
- Create: `src/adapters/hermes/plugins.ts`
- Create: `src/adapters/hermes/adapter.ts`
- Create: `test/contract/hermes-adapter.test.ts`
- Create: `test/fixtures/hermes/posix/**`
- Create: `test/fixtures/hermes/windows/**`

- [ ] **Step 1: Build failing Hermes contract fixtures**

Cover explicit `HERMES_HOME`, POSIX and Windows defaults/fallback, sticky `active_profile`, immediate named profile candidates, `config.yaml:mcp_servers`, `enabled: false`, `skills.external_dirs`, local-over-external same-name skills, `plugins.enabled`/`disabled`, project plugin environment gating, `SOUL.md`, optional MCP manifests, `.env`-dependent unresolved activation, malformed YAML, and sentinel OAuth/state/memory files that must never be read.

- [ ] **Step 2: Write failing Hermes assertions**

Verify absent `HERMES_HOME` keeps the platform default effective while sticky non-default profiles are candidates; `SOUL.md` is always-loaded content; optional MCP manifests are candidates only; local skills shadow external same-name skills; disabled plugins win; runtime-only entry-point/Nix resolution is unresolved only when referenced; read traces exclude `.env`, OAuth files, `state.db`, memory, and Python imports.

- [ ] **Step 3: Run the Hermes contract and verify red**

Run: `pnpm exec vitest run test/contract/hermes-adapter.test.ts`

Expected: FAIL because the Hermes adapter does not exist.

- [ ] **Step 4: Implement Hermes roots and safe YAML projections**

Resolve native platform defaults from the injected context, enumerate only immediate profile directories within limits, and project only documented config keys. Do not source `.env`. Admit external skill directories only from `skills.external_dirs`.

- [ ] **Step 5: Implement skills, MCP, SOUL, and plugin status**

Use active `config.yaml:mcp_servers` for runtime MCP status and `optional-mcps/<name>/manifest.yaml` for candidates. Apply local-skill precedence. Inspect statically located bundled/user/project plugin roots, project gating, and disabled precedence; never import entry points or query Nix/Python runtimes.

- [ ] **Step 6: Verify Hermes and generic rules**

Run: `pnpm exec vitest run test/contract/hermes-adapter.test.ts test/unit/analyzers test/contract/report-schema.test.ts && pnpm typecheck`

Expected: Hermes contract and downstream tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/hermes test/contract/hermes-adapter.test.ts test/fixtures/hermes
git commit -m "feat: inspect Hermes environments"
```

## Task 12: Complete doctor reporters, CLI behavior, and no-write proof

**Files:**
- Create: `src/reporters/json.ts`
- Create: `src/reporters/terminal.ts`
- Create: `src/cli/doctor.ts`
- Modify: `src/cli/main.ts`
- Create: `test/unit/reporters/json.test.ts`
- Create: `test/unit/reporters/terminal.test.ts`
- Create: `test/integration/doctor-cli.test.ts`
- Create: `test/integration/doctor-no-write.test.ts`
- Create: `test/helpers/deny-network.mjs`

- [ ] **Step 1: Write failing reporter and CLI integration tests**

Test TTY-default terminal output, non-TTY-default JSON, explicit JSON, agent mode, styling disabled, verbose stderr only, selected/repeated agents, missing agents, partial adapters, malformed config serialization, invalid arguments, and `--fail-on error|warning`.

```ts
expect(run.stdout.trim().startsWith("{")).toBe(true);
expect(() => JSON.parse(run.stdout)).not.toThrow();
expect(run.stderr).toBe("");
expect(run.exitCode).toBe(0);
```

- [ ] **Step 2: Add a failing no-write snapshot test**

Copy a fixture to a temporary directory, snapshot every path/type/size/hash before and after running the already built `dist/cli/main.js doctor --agent-mode`, and exclude only the test harness output outside the fixture. Assert identical snapshots and no attempted write through an instrumented backend. Run the subprocess with `NODE_OPTIONS=--import test/helpers/deny-network.mjs`; the preload replaces `fetch` and Node HTTP/HTTPS/net connection entry points with throwing sentinels, so any runtime network attempt fails the test.

- [ ] **Step 3: Run reporter/CLI tests and verify red**

Run: `pnpm build && pnpm exec vitest run test/unit/reporters test/integration/doctor-cli.test.ts test/integration/doctor-no-write.test.ts`

Expected: FAIL because reporters and doctor composition do not exist.

- [ ] **Step 4: Implement pure reporters and doctor composition**

`renderJson` returns exactly `JSON.stringify(report)` plus one newline after validating report invariants. `renderTerminal` shows summary, coverage, component table, actionable numbered findings, then non-actionable items. It receives `color` explicitly. `runDoctor` builds context, selects adapters, orchestrates, renders, and returns the exit code without calling `process.exit`.

- [ ] **Step 5: Implement exact exit/stdout/stderr semantics**

Invalid arguments or invalid report: exit 2, cataloged stderr, empty stdout. Completed scan: exit 1 only when `--fail-on` threshold is met, otherwise 0. Partial/failed individual adapters serialize inside the report. Successful JSON stderr is empty unless `--verbose`; verbose output is cataloged and redacted.

- [ ] **Step 6: Verify CLI, schema, security, and no-write tests**

Run: `pnpm build && pnpm exec vitest run test/unit/reporters test/integration/doctor-cli.test.ts test/integration/doctor-no-write.test.ts test/contract/report-schema.test.ts test/unit/core/parsers.test.ts test/unit/core/redaction.test.ts test/unit/rules/mcp-fingerprint.test.ts`

Expected: all tests pass, JSON parses, seeded secrets are absent, and filesystem snapshots match.

- [ ] **Step 7: Commit**

```bash
git add src/reporters src/cli/doctor.ts src/cli/main.ts test/unit/reporters test/integration
git commit -m "feat: deliver read-only doctor command"
```

## Task 13: Implement owned launcher-skill setup and uninstall

**Files:**
- Create: `src/setup/destinations.ts`
- Create: `src/setup/launcher.ts`
- Create: `src/setup/manifest.ts`
- Create: `src/setup/safe-write.ts`
- Create: `src/cli/setup.ts`
- Modify: `src/cli/main.ts`
- Create: `test/unit/setup/destinations.test.ts`
- Create: `test/unit/setup/launcher.test.ts`
- Create: `test/integration/setup-lifecycle.test.ts`

- [ ] **Step 1: Write failing destination and manifest tests**

Verify Codex uses `$HOME/.agents/skills`, Claude uses `CLAUDE_CONFIG_DIR` or `~/.claude`, and Hermes uses explicit `HERMES_HOME` or its native platform default rather than sticky `active_profile`. Verify exact package version in `SKILL.md` and exact-byte SHA-256 in a separate manifest.

```ts
expect(renderLauncher("0.1.0")).toContain(
  "npx -y agent-hygiene-cli@0.1.0 doctor --agent-mode",
);
expect(parseManifest(manifest)).toEqual({
  owner: "agent-hygiene-cli",
  schemaVersion: 1,
  packageName: "agent-hygiene-cli",
  packageVersion: "0.1.0",
  skillSha256: sha256(skillBytes),
});
```

- [ ] **Step 2: Write failing lifecycle safety tests**

Cover default dry-run, TTY confirmation, non-TTY `--yes`, manifest-last install, same-directory exclusive temp files, simulated interruption, link/junction/ADS/device/drive-relative rejection, non-owned refusal, modified-owned refusal, `--force` replacement only for owned installs, uninstall hash mismatch refusal, exact two-file deletion, and remove-directory-only-when-empty.

- [ ] **Step 3: Run setup tests and verify red**

Run: `pnpm exec vitest run test/unit/setup test/integration/setup-lifecycle.test.ts`

Expected: FAIL because setup modules do not exist.

- [ ] **Step 4: Implement pure destination, launcher, and manifest logic**

Use the immutable context and exact package version. The launcher contains no copied diagnostics, only instructions to run agent mode, explain manual recommendations, and avoid configuration edits. Manifest parsing is closed and rejects unknown/missing properties.

- [ ] **Step 5: Implement safe write/delete lifecycle**

Validate every existing destination component before creating anything. Create exclusive randomized temp regular files in the final directory, write/flush/close, rename `SKILL.md`, then rename the manifest last. On failure, remove only known temp files. Never follow links. Uninstall rehashes exact bytes, deletes only the two verified files, and removes the directory only if empty.

- [ ] **Step 6: Wire setup CLI confirmation semantics**

`setup` and `setup --dry-run` report a plan. In a TTY, install/uninstall may ask once; in non-interactive use, writes require `--yes`. `--force` cannot take over non-owned files and never permits deletion of a modified skill. Return 2 for invalid flags and ownership/safety refusal.

- [ ] **Step 7: Verify setup lifecycle and doctor regression**

Run: `pnpm exec vitest run test/unit/setup test/integration/setup-lifecycle.test.ts test/integration/doctor-no-write.test.ts && pnpm typecheck`

Expected: all tests pass and doctor remains write-free.

- [ ] **Step 8: Commit**

```bash
git add src/setup src/cli/setup.ts src/cli/main.ts test/unit/setup test/integration/setup-lifecycle.test.ts
git commit -m "feat: manage owned launcher skills safely"
```

## Task 14: Document, package, and verify the release candidate

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `scripts/verify-pack.mjs`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-07-10-agent-hygiene-cli.md` (check completed boxes during execution)

- [ ] **Step 1: Write the failing packed-package check**

`scripts/verify-pack.mjs` must run `pnpm pack --json` itself, parse the returned tarball filename without relying on directory ordering, create a temporary project, install that exact tarball, execute the installed `agent-hygiene` bin and `npx -y <tarball> doctor --agent-mode`, validate stdout against `schema/report-v1.schema.json`, require empty default stderr, verify the package declares exactly one bin, and remove only its generated temporary project and tarball in a `finally` block.

- [ ] **Step 2: Run pack verification and verify red**

Run: `pnpm build && node scripts/verify-pack.mjs`

Expected: FAIL until package files, README/license allowlist, and verification script are complete.

- [ ] **Step 3: Write README and license**

README must include the exact pasteable prompt, `agent-hygiene-cli` package versus `agent-hygiene` executable naming, Node.js 22 requirement, `npx` bootstrap network/cache caveat, post-startup offline/read-only guarantee, CLI/exit-code reference, partial-coverage semantics, JSON schema link, setup ownership behavior, supported sources, non-goals, and contributor commands. Use an MIT license attributed to “Agent Hygiene contributors”.

- [ ] **Step 4: Add CI and publish metadata**

CI matrix runs `pnpm install --frozen-lockfile` and `pnpm check` on Windows, macOS, and Linux with Node.js 22, then runs pack verification on Linux. Package metadata includes repository placeholders only if a real repository URL exists; do not invent one. Ensure tarball contains only dist, schema, README, LICENSE, and package metadata.

- [ ] **Step 5: Run the complete verification suite**

Run: `pnpm check`

Expected: lint, typecheck, all unit/contract/integration tests, and build pass.

Run: `node scripts/verify-pack.mjs`

Expected: packed install, installed bin, tarball `npx`, schema validation, stdout/stderr, and exit-code checks pass.

- [ ] **Step 6: Run final security assertions**

Run the seeded-secret suite and no-write snapshot again against the packed CLI under the deny-network preload. Place executable-looking sentinel commands, hooks, plugins, and skill scripts in the fixture and assert their marker files remain absent. Search built output, reports, snapshots, and logs for every seeded secret. Expected: zero network calls, zero matches, zero fixture changes, and no discovered code execution.

- [ ] **Step 7: Commit**

```bash
git add README.md LICENSE scripts .github package.json pnpm-lock.yaml docs/superpowers/plans/2026-07-10-agent-hygiene-cli.md
git commit -m "docs: prepare Agent Hygiene 0.1 release"
```

## Final verification checklist

- [ ] `pnpm lint` exits 0.
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm test` reports zero failures.
- [ ] `pnpm build` exits 0.
- [ ] `pnpm pack` succeeds and the tarball contains only allowed files.
- [ ] Packed installed bin and tarball `npx` both emit schema-valid JSON.
- [ ] Successful JSON mode writes no default stderr.
- [ ] Seeded secrets are absent from terminal, JSON, verbose logs, built files, and snapshots.
- [ ] Packed `doctor` makes no network request, executes no discovered code, and does not change the scanned fixture.
- [ ] One failed adapter does not suppress successful adapters.
- [ ] Partial/unknown coverage creates no absence-based recommendation.
- [ ] Setup/uninstall operates only on the two verified owned files.
- [ ] README pasteable prompt uses `npx -y agent-hygiene-cli@latest doctor --agent-mode`.
