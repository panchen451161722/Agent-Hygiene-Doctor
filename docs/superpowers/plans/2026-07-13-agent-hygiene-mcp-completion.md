# Agent Hygiene MCP 发现与分析完成计划

> 可直接交给 Codex、Claude、GPT 等后续模型执行。
> 工作目录：`D:\project\agent-hygiene\.worktrees\agent-hygiene-v01`
> 分支：`codex/agent-hygiene-v01`
> 基线提交：`ffacede`
> 目标：让 Codex、Claude、Hermes 的 MCP 配置进入 inventory、findings 和 terminal/JSON report，并纠正虚假的 complete coverage。

## 1. 开始前必须确认

```powershell
git status --short
git log --oneline -5
pnpm check
agent-hygiene doctor --agent codex
```

预期基线：

- 工作树除本计划外应干净。
- `pnpm check` 通过，当前约为 31 个测试文件、150 项测试。
- Codex terminal report 能显示 skills 和 `config.toml`，但没有 `kind: "mcp"`。
- Codex adapter 只验证 TOML 可解析，然后把整个文件投影成一个 configuration item。
- `src/analyzers/mcp.ts` 仍是通用 unresolved 占位实现。
- adapter 用 `inventory.length > 0 ? "complete" : "unknown"` 计算 coverage，这是错误的：未扫描 MCP、hooks、plugins 时不得称为 complete。

如果基线已经变化，应先重新审计，不要覆盖后续模型已完成的实现。

## 2. 不可违反的边界

- `doctor` 不访问网络、不启动子进程、不执行 MCP command、不调用 package runner。
- 所有文件读取必须经过共享 `SafeFileSystem` 和 semaphore。
- 不读取或输出 token、secret、password、Authorization header、环境变量值或完整 MCP URL。
- report 不得包含主机绝对路径、原始 parser error、stack、配置原文。
- MCP env/headers 只允许保留字段名；凭据值必须在 inspector 之前丢弃。
- HTTP/SSE 只报告 URL class 和安全 fingerprint，不报告 raw URL。
- 未实现的发现面必须标为 partial/unknown，不能因为发现了一个配置文件就标为 complete。
- projection helper 单测不能代替真实 adapter discovery 测试。

## 3. 当前可复用代码

- `src/inspectors/mcp.ts`：已有 `inspectMcp`，但需要补齐 `packageInvocation` facts。
- `src/rules/mcp-fingerprint.ts`：已有安全 command/args/URL shape 和 fingerprint。
- `src/rules/package-spec.ts`：已有 npx/npm exec/pnpm dlx/yarn dlx/bunx pin 识别。
- `src/core/inventory.ts`：已有 `McpFacts`。
- `src/core/parsers/{toml,json,yaml}.ts`：已有受限解析器。
- `src/core/fs/safe-fs.ts`：所有真实发现必须复用。
- `src/reporters/terminal.ts`：出现 MCP item 后会自动显示。
- `src/core/report.ts`：负责稳定 ID、排序、summary 和 schema-valid report。

## 4. Task A：先纠正 coverage 语义

修改：

- `src/adapters/codex/adapter.ts`
- `src/adapters/claude/adapter.ts`
- `src/adapters/hermes/adapter.ts`
- `test/contract/live-adapters.test.ts`
- 各 agent contract tests

工作：

- [ ] 移除 `inventory.length > 0 ? "complete" : "unknown"`。
- [ ] adapter 尚未覆盖规格全部 surfaces 时返回 `partial`；完全未检测到 root/artifact 时返回 `unknown`。
- [ ] parse/read/limit/unsafe diagnostic 必须降低 coverage。
- [ ] 测试证明“只发现 config 或 skill”不会得到 complete。
- [ ] terminal 显示 `codex: partial (partial)`，直到完整 surface 验收完成。

提交：`fix: report honest adapter coverage`

## 5. Task B：定义闭合 Codex MCP projection

修改/新增：

- `src/adapters/codex/config.ts`
- 新增 `src/adapters/codex/mcp.ts`
- `src/inspectors/mcp.ts`
- `test/unit/inspectors/inspectors.test.ts`
- `test/contract/codex-adapter.test.ts`

从已安全解析的 TOML 对象读取 `mcp_servers` table。每个直属 key 是 server name。只接受闭合字段：

- stdio：`command: string`、`args?: string[]`、`env?: object`、`enabled?: boolean`
- HTTP/SSE：`url: string`、`headers?: object`、`enabled?: boolean`
- transport 不能静态确定时创建 unresolved MCP item，不能丢弃或猜测。

输出要求：

- [ ] 每个 server 产生独立 `InventoryItem`，`kind: "mcp"`，name 使用配置 key，而不是 command。
- [ ] SourceRef 指向配置文件；用稳定 name/itemId 区分 server，不伪造文件路径。
- [ ] `enabled === false` 为 disabled；有效且启用为 active；形状不明为 unresolved。
- [ ] stdio facts：transport、endpointFingerprint、commandResolution、credentialLikeFields、packageInvocation。
- [ ] HTTP/SSE facts：transport、endpointFingerprint、credentialLikeFields、urlClass。
- [ ] `inspectMcp` 补齐 `packageInvocation`：exact/unpinned/not-applicable/unknown。
- [ ] name、facts、fingerprint 都不能含 secret 或绝对路径。
- [ ] 输入顺序变化不改变最终 report 顺序或 ID。

URL 分类：

- loopback：localhost、127.0.0.0/8、::1。
- tls：非 loopback HTTPS。
- plaintext-remote：非 loopback HTTP。
- unknown：URL 无法安全解析或 scheme 不支持。

command resolution：

- 不执行 command。
- 仅允许 metadata-only PATH 检查；若安全层尚无 API，先报告 unknown，不能绕过 `SafeFileSystem`。
- 绝对 executable path 不得进入 report。

提交：`feat: project Codex MCP inventory`

## 6. Task C：接入真实 Codex adapter

修改/新增：

- `src/adapters/codex/adapter.ts`
- `test/contract/live-adapters.test.ts`
- `test/fixtures/codex/mcp-valid/config.toml`
- `test/fixtures/codex/mcp-invalid/config.toml`
- privacy sentinel fixtures

工作：

- [ ] user `codex-home:config.toml` 的 MCP servers 进入 inventory。
- [ ] project `.codex/config.toml` 的 MCP servers 进入 inventory。
- [ ] project/user precedence 保留，不能静默合并同名 server。
- [ ] trust 未知时 project MCP 标为 unresolved，除非设计规格明确允许 active。
- [ ] parse error 产生 configuration item、diagnostic，但不产生猜测的 MCP。
- [ ] disabled server 保留在 inventory。
- [ ] credential-like env/header 只显示字段名。
- [ ] seeded secret 不得出现在 terminal、JSON、snapshot、fingerprint serialization。
- [ ] read trace 证明 auth、sessions、logs、history 未被读取。

必须覆盖：stdio、精确版本 npx、未固定 npx、disabled、HTTPS、远程 HTTP、loopback、credential env/header、malformed shape、user/project 同名 server。

提交：`feat: discover Codex MCP servers`

## 7. Task D：实现专用 MCP analyzer 与 catalog rules

修改/新增：

- `src/analyzers/mcp.ts`
- `src/rules/catalog.ts`
- `src/rules/manual-steps.ts`
- `test/unit/analyzers/mcp.test.ts`
- report schema tests

最小闭合规则集（如设计规格已有固定 ID，以规格为准）：

- `mcp-command-not-found`：stdio command 静态确认不存在，warning。
- `mcp-package-unpinned`：package runner 使用未固定 package，warning。
- `mcp-credential-field`：发现 credential-like env/header 字段名，info 或 warning，证据不得含值。
- `mcp-plaintext-remote`：非 loopback HTTP，warning。
- `mcp-transport-unknown`：无法安全确定 transport，warning。
- `duplicate-active`：同 fingerprint 的 active MCP 跨配置/agent 重复，warning。

约束：

- [ ] 只分析 `facts.type === "mcp"`，不能复用 unresolved 通用占位实现。
- [ ] disabled MCP 不产生 activation-based warning。
- [ ] commandResolution unknown 不产生 command-not-found。
- [ ] coverage partial/unknown 时不产生 absence-based finding。
- [ ] findings 输入顺序无关，evidence 稳定，instanceId 由 report builder 生成。
- [ ] recommendation/manualSteps 不含绝对路径、secret、raw command line。
- [ ] catalog 每个新增 rule 至少一个正例和反例。

提交：`feat: analyze MCP hygiene deterministically`

## 8. Task E：doctor composition 接入 MCP analyzer

修改：

- `src/cli/doctor.ts`
- 必要时新增 `src/analyzers/index.ts`
- `test/integration/doctor-cli.test.ts`
- `test/contract/report-schema.test.ts`

工作：

- [ ] doctor 不再只调用 `analyzeConfiguration`。
- [ ] composition 至少调用 configuration + MCP analyzer，并稳定合并结果。
- [ ] `--fail-on warning` 在 MCP warning 存在时返回 1。
- [ ] 默认 `--fail-on error` 在只有 MCP warning 时返回 0。
- [ ] terminal 显示 MCP inventory、finding、evidence、recommendation。
- [ ] JSON/agent-mode 保持 schema-valid，成功时 stderr 为空。
- [ ] `--agent codex` 只出现 Codex adapter/inventory/findings。

预期示例：

```text
[codex] mcp github — active, user — codex-home:config.toml
[warning] MCP package invocation is not pinned (mcp-package-unpinned)
```

提交：`feat: report MCP findings from doctor`

## 9. Task F：Claude 与 Hermes MCP discovery

Codex 完成并稳定后再复用 projection，不要同时修改三个 adapter 的公共类型。

Claude：

- [ ] 读取 project `.mcp.json`。
- [ ] 读取 managed MCP/settings 中规格允许的 MCP 部分。
- [ ] 受限投影 `.claude.json`，不得读取 history、transcripts、cache。
- [ ] managed/project/user precedence 有 contract tests。

Hermes：

- [ ] 从 `config.yaml` 投影 `mcp_servers`。
- [ ] 处理 enabled false 和 active profile。
- [ ] 可选 MCP manifests 必须经过 SafeFileSystem。
- [ ] OAuth/state/`.env` 值不得读取或输出。

提交：

- `feat: discover Claude MCP servers`
- `feat: discover Hermes MCP servers`

## 10. 测试和验证顺序

每个任务严格执行：

```powershell
pnpm typecheck
pnpm exec vitest run <本任务目标测试>
pnpm lint
pnpm check
git diff --check
```

最终人工验证：

```powershell
pnpm build
agent-hygiene doctor --agent codex
agent-hygiene doctor --agent codex --format json
agent-hygiene doctor --project ./test/fixtures/codex/mcp-valid --agent codex
agent-hygiene doctor --project ./test/fixtures/codex/mcp-valid --agent codex --fail-on warning
agent-hygiene doctor --agent-mode
```

最终还必须证明：

- JSON 通过 `schema/report-v1.schema.json`。
- terminal/JSON 均不含 seeded secret。
- 扫描 fixture 前后文件哈希一致。
- 无网络调用、子进程、写入。
- packed tarball 的真实 bin 能显示 MCP。

## 11. 完成定义

只有全部满足才能宣布 MCP 阶段完成：

- [ ] Codex、Claude、Hermes 的规定 MCP 来源都被真实发现。
- [ ] stdio/http/sse/disabled/unresolved 状态正确。
- [ ] MCP inventory 在 terminal 和 JSON 中可见。
- [ ] pinning、credential field、plaintext remote、command resolution 规则确定性工作。
- [ ] `--fail-on` 对 MCP findings 的退出码正确。
- [ ] 所有 secret/privacy sentinel 测试通过。
- [ ] 未实现 surfaces 不再报告 complete coverage。
- [ ] `pnpm check`、pack install、真实 bin 验证通过。
- [ ] 工作树干净，每个任务独立提交。

## 12. 给下一模型的启动指令

```text
在 D:\project\agent-hygiene\.worktrees\agent-hygiene-v01 工作。
完整阅读 docs/superpowers/plans/2026-07-13-agent-hygiene-mcp-completion.md、
docs/superpowers/plans/2026-07-12-agent-hygiene-v1-completion.md 和对应设计规格。
从第一个未完成 Task 开始，先运行 git status、git log 和 pnpm check。
严格测试先行、每阶段独立提交。所有读取必须走 SafeFileSystem；不得网络访问、执行 MCP command、输出 secret/绝对路径。
不要把发现 config.toml 当作 MCP 已完成，不要在未覆盖全部 surfaces 时报告 complete coverage。
每阶段报告变更、测试数量、提交 hash 和仍未完成项。
```