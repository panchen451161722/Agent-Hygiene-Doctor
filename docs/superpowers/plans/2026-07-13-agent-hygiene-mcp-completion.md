# Agent Hygiene MCP 完成计划（当前状态版）

> 修订日期：2026-07-13
> 工作目录：`D:\project\agent-hygiene\.worktrees\agent-hygiene-v01`
> 分支：`codex/agent-hygiene-v01`
> 当前代码基线：`a15b02b`
> 当前验证基线：32 个测试文件、168 项测试，`pnpm check` 通过。
> 用途：可直接交给 Codex、Claude、GPT 等后续模型继续执行。

## 1. 目标

完成 Codex、Claude、Hermes 的 MCP 安全发现、确定性分析和发布验收，使 MCP server 能正确进入：

- terminal inventory；
- JSON/agent-mode report；
- MCP-specific findings；
- `--fail-on warning` 退出码；
- packed package 的真实 `agent-hygiene` bin。

任何时候都不能因为发现了一个配置文件就报告 complete coverage。

## 2. 当前真实状态

### 已完成并提交

- `965ed21 fix: report honest adapter coverage`
  - 三个 adapter 在只覆盖部分 surfaces 时返回 `partial`。
- `fddd354 feat: discover Codex MCP servers`
  - Codex user/project TOML `mcp_servers` 基础发现。
  - stdio、HTTP/SSE、disabled/unresolved 基础投影。
  - package pin、URL class、安全 fingerprint、credential-like 字段名。
- `3d92ebc feat: report MCP hygiene findings`
  - `mcp-package-unpinned`。
  - `mcp-plaintext-remote`。
  - `mcp-credential-field`。
  - `mcp-transport-unknown`。
  - doctor composition 和 `--fail-on warning`。
- `fadaec6 feat: discover Claude and Hermes MCP servers`
  - Claude project `.mcp.json` 基础发现。
  - Claude settings 中 `mcpServers` 基础投影。
  - Hermes `config.yaml` 中 `mcp_servers` 基础发现。

### 部分完成，不能标记完成

- Coverage：已改为 partial，但 read/limit/unsafe failures 仍可能被 adapter 静默忽略。
- Codex：基础 MCP 已发现，但 trust、重复 server、完整 fixtures/read trace 未完成。
- Claude：managed settings/MCP、local/project/user precedence 已完成；受限 `.claude.json` 未完成。
- Hermes：config MCP、optional manifest catalog 与 sticky profile candidates 已发现；OAuth/state 隔离验收未完成。
- Analyzer：已有四条 MCP 规则，但 finding 唯一性、typed analyzer 隔离、command resolution、跨 agent duplicate 未完成。
- Privacy：inspector 输出不含值，但 env/header 原始值仍会进入 inspector 内存，不满足“进入 inspector 前丢弃值”的边界。
- Pack：`scripts/verify-pack.mjs` 仍只运行 `dist/cli/main.js`，没有安装 tarball 并运行真实 bin。

## 3. 不可违反的安全边界

- `doctor` 不访问网络、不执行子进程、不运行 MCP command、不调用 package runner。
- 所有内容读取必须经过共享 `SafeFileSystem` 和 semaphore。
- 不读取或输出 token、secret、password、Authorization、环境变量值、header 值或完整 MCP URL。
- report 不得包含绝对路径、raw parser error、stack、配置原文。
- env/header 的值必须在 projection 层丢弃；inspector 只能接收字段名。
- URL 只能进入受控 classifier/fingerprint；report 不得保存 raw URL。
- partial/unknown coverage 不能产生 absence-based finding。
- projection helper 单测不能代替真实 adapter discovery、trace 和 CLI 测试。

## 4. 下一模型的执行顺序

必须按以下顺序执行：

1. Task G：MCP 正确性加固。
2. Task H：Claude/Hermes source 与 precedence 完成。
3. Task I：metadata command resolution 和 duplicate analysis。
4. Task J：privacy/no-write/read-trace 验收。
5. Task K：packed bin 与最终 MCP 验收。

不要从旧 Task A 重新开发；已完成代码必须先审计后复用。

## 4.1 已完成的 Task G 加固（2026-07-13）

- [x] G1：`2eb0d32` 以 MCP item evidence 保证同一配置中的 findings ID 唯一。
- [x] G2：`13ba49d` 将 configuration analyzer 限制为 configuration facts。
- [x] G3：`20235b3` 在 inspector 前只保留 credential 字段名。
- [x] G4：`1c47cd8` 抽离共享 MCP projection，Claude/Hermes 不再依赖 Codex adapter。
- [x] G5：`a15b02b` 覆盖空 command、错误 env/header、冲突 command/url、IPv6 loopback 和 disabled malformed MCP。

后续执行从 Task H 开始；保留 Task G 内容作为已验证的设计约束与回归参考。
## 5. Task G：MCP 正确性加固（最高优先级）

### G1. 修复 finding instance ID 冲突

当前风险：`src/analyzers/mcp.ts` 的 finding evidence 只有配置文件 SourceRef。同一配置文件内两个 server 命中同一 rule 时，`buildReport` 可能生成相同 instance ID。

修改：

- `src/analyzers/mcp.ts`
- `test/unit/analyzers/mcp.test.ts`
- `test/contract/report-schema.test.ts`
- `test/integration/doctor-cli.test.ts`

要求：

- [ ] 每个 MCP finding 的 evidence 包含唯一 MCP item identity。
- [ ] 优先使用 `{ kind: "items", itemIds: [item.itemId] }`；如使用 field evidence，字段名必须稳定且不含 secret。
- [ ] 同一 config 内两个 unpinned MCP 产生两个不同 findings。
- [ ] report builder 不抛 duplicate generated finding id。
- [ ] 输入顺序变化不改变最终 finding ID 和排序。

建议提交：`fix: preserve unique MCP finding identities`

### G2. 限制 analyzer 只处理对应 facts

当前风险：`analyzeConfiguration` 仍是通用 unresolved analyzer，可能对 unresolved MCP 再产生 `unresolved-artifact`，与 `mcp-transport-unknown` 重叠。

修改：

- `src/analyzers/configuration.ts`
- `src/analyzers/mcp.ts`
- 其他仍使用通用占位实现的 analyzers
- 对应 unit tests

要求：

- [ ] configuration analyzer 只处理 `facts.type === "configuration"`。
- [ ] MCP analyzer 只处理 `facts.type === "mcp"`。
- [ ] disabled MCP 不产生 activation finding。
- [ ] unresolved MCP 只产生设计规定的 MCP finding，不重复产生 generic finding。
- [ ] 每个 analyzer 有非目标 facts 的反例测试。

建议提交：`fix: isolate analyzers by inventory facts`

### G3. 在 inspector 前丢弃 credential values

当前风险：`projectMcpServers` 把 env/header string map 原样传给 `inspectMcp`，虽未进入 report，但违反隐私边界。

修改：

- `src/adapters/codex/mcp.ts`
- `src/inspectors/mcp.ts`
- `src/rules/mcp-fingerprint.ts`
- inspector/adapter privacy tests

要求：

- [ ] projection 只输出 `environmentNames` / `headerNames` 或等价闭合字段。
- [ ] `McpInput` 不再接受 credential values。
- [ ] fingerprint 只使用字段名，不使用值。
- [ ] seeded secret 在 inspector 输入之后不可访问。
- [ ] JSON.stringify(adapter result/finding/report) 均不含 seeded secret。

建议提交：`fix: discard MCP credential values before inspection`

### G4. 抽离共享 MCP projection

当前问题：Claude/Hermes 从 `src/adapters/codex/mcp.ts` 导入通用函数，形成错误依赖方向。

要求：

- [ ] 将通用 shape validation、URL classifier、safe projection 移到 `src/adapters/shared/mcp.ts` 或等价共享模块。
- [ ] `src/adapters/codex/mcp.ts` 只保留 Codex-specific key/precedence/trust 映射。
- [ ] Claude/Hermes 不再 import Codex adapter 模块。
- [ ] 公共类型使用中性名称，不再叫 `CodexMcpProjection`。

建议提交：`refactor: share MCP projection across adapters`

### G5. 严格验证 MCP shape

补齐测试：

- [ ] args 不是字符串数组 -> unresolved。
- [ ] env/header 不是闭合字符串 map -> unresolved，而不是静默忽略。
- [ ] command 与 url 同时存在 -> unresolved。
- [ ] 空 command、空 server name -> unresolved。
- [ ] unsupported transport/scheme -> unresolved。
- [ ] localhost、127.0.0.0/8、`[::1]` -> loopback。
- [ ] HTTPS remote -> tls。
- [ ] HTTP remote -> plaintext-remote。
- [ ] disabled malformed server 仍保留且不产生 activation warning。
- [ ] unknown keys 的处理与设计规格一致并有测试。

建议提交：`test: close MCP projection edge cases`

## 6. Task H：完成 Claude 与 Hermes MCP 来源

### Claude

修改：

- `src/adapters/claude/adapter.ts`
- Claude settings/roots helper
- `test/contract/claude-adapter.test.ts`
- POSIX/Windows fixtures

要求：

- [x] project `.mcp.json` 基础发现。
- [x] settings 中 `mcpServers` 基础投影。
- [x] managed MCP/settings 来源。
- [x] local project > project > user precedence；managed 按设计规格覆盖。
- [ ] 受限读取 `.claude.json` 的 MCP 部分。
- [ ] 不读取 history、transcripts、snapshots、memory、cache。
- [ ] approval unknown 的 project MCP 标为 unresolved。
- [ ] 同名 server 不被静默覆盖，保留各自 source/status。

### Hermes

修改：

- `src/adapters/hermes/adapter.ts`
- Hermes config/profile helper
- `test/contract/hermes-adapter.test.ts`
- POSIX/Windows fixtures

要求：

- [x] `config.yaml` 的 `mcp_servers` 基础发现。
- [x] enabled false 基础状态投影。
- [x] sticky `active_profile` 与 immediate candidate profiles。
- [x] 可选 MCP manifests 经过 SafeFileSystem。
- [ ] `.env` 只能产生 unresolved activation，不读取值。
- [ ] 不读取 OAuth/state/memory 文件。
- [ ] profile precedence 和 duplicate server 有 contract tests。

建议提交：

- `feat: complete Claude MCP precedence`
- `feat: complete Hermes MCP profiles`

## 7. Task I：command metadata 与 duplicate analysis

### I1. Metadata-only command resolution

当前 `commandResolution` 基本为 unknown。

要求：

- [ ] 新增安全的 metadata-only executable lookup API。
- [ ] 不执行 command。
- [ ] Windows 支持 PATH/PATHEXT；POSIX 支持 executable metadata。
- [ ] 绝对路径不得进入 report。
- [ ] 只输出 resolved/not-found/unknown。
- [ ] unknown 不产生 `mcp-command-not-found`。
- [ ] confirmed not-found 才产生 warning。

建议提交：`feat: resolve MCP commands without execution`

### I2. Cross-source/cross-agent duplicate

要求：

- [ ] 使用 endpointFingerprint 比较 active MCP。
- [ ] disabled/unresolved 不参与 active duplicate warning。
- [ ] 同一 server 在 user/project/agent 间重复时保留所有 inventory items。
- [ ] finding evidence 使用 item IDs，保证稳定和唯一。
- [ ] 输入顺序变化不影响结果。

建议提交：`feat: detect duplicate active MCP endpoints`

## 8. Task J：安全与无副作用验收

新增 integration tests：

- [ ] seeded token 同时放入 env、headers、URL query、args opaque value。
- [ ] terminal、JSON、agent-mode、findings、snapshots 均不含 seeded token。
- [ ] fixture 扫描前后字节 hash 完全一致。
- [ ] read trace 证明 auth、sessions、logs、history、transcripts、OAuth/state、memory 未读取。
- [ ] 不调用网络、不生成子进程、不执行 discovered command。
- [ ] unsafe reference、limit exceeded、read failed 映射为 cataloged diagnostic，并降低 coverage。
- [ ] 一个 adapter 失败不影响其他 adapter。

建议提交：`test: verify MCP privacy and read-only boundaries`

## 9. Task K：packed package 与真实 bin 验收

当前 `scripts/verify-pack.mjs` 不足：它只直接运行 `dist/cli/main.js`。

重写要求：

- [ ] `pnpm pack` 生成 tarball。
- [ ] 安装 tarball 到临时目录。
- [ ] 运行安装后的 `agent-hygiene` bin，而不是源码 dist。
- [ ] 验证 terminal 能显示 MCP inventory。
- [ ] 验证 `--format json` 和 `--agent-mode` schema-valid。
- [ ] 验证 MCP warning 下 `--fail-on warning` 返回 1。
- [ ] 验证只有 warning 时默认 `--fail-on error` 返回 0。
- [ ] 验证 stdout/stderr 精确边界。
- [ ] 验证 packed 输出不含 seeded secret。
- [ ] 验证 tarball files allowlist。

实际 fixture 路径统一使用：

```text
test/fixtures/mcp-project
```

不要继续引用不存在的 `test/fixtures/codex/mcp-valid`，除非先创建并迁移所有测试。

建议提交：`test: verify packed MCP doctor workflow`

## 10. 每阶段验证纪律

```powershell
git status --short
pnpm typecheck
pnpm exec vitest run <目标测试>
pnpm lint
pnpm check
git diff --check
```

每个阶段：

- 先确认失败测试的原因正确；
- 只实现该阶段功能；
- 独立提交；
- 更新本计划状态；
- 报告测试数量、commit hash、仍未完成项。

## 11. 最终人工验收

```powershell
pnpm build
agent-hygiene doctor --agent codex
agent-hygiene doctor --agent codex --format json
agent-hygiene doctor --project ./test/fixtures/mcp-project --agent codex
agent-hygiene doctor --project ./test/fixtures/mcp-project --agent codex --fail-on warning
agent-hygiene doctor --agent claude
agent-hygiene doctor --agent hermes
agent-hygiene doctor --agent-mode
node scripts/verify-pack.mjs
```

## 12. MCP 阶段完成定义

只有全部满足才能宣布完成：

- [ ] Codex、Claude、Hermes 的规定 MCP 来源被真实发现。
- [ ] stdio/http/sse/disabled/unresolved 状态正确。
- [ ] MCP inventory 在 terminal 和 JSON 中可见。
- [ ] 同一配置内多个同规则 findings ID 唯一。
- [ ] typed analyzers 不重复分析其他 facts。
- [ ] credential values 在 inspector 前已丢弃。
- [ ] package pin、URL class、command resolution、duplicate rules 确定性工作。
- [ ] `--fail-on` 对 MCP findings 的退出码正确。
- [ ] privacy sentinel、read trace、no-write、no-network、no-subprocess 测试通过。
- [ ] 未实现 surfaces 不报告 complete coverage。
- [ ] packed tarball 安装与真实 bin 验证通过。
- [ ] `pnpm check` 全绿，Git 工作树干净。

## 13. 给下一模型的启动指令

```text
在 D:\project\agent-hygiene\.worktrees\agent-hygiene-v01 工作。
完整阅读 docs/superpowers/plans/2026-07-13-agent-hygiene-mcp-completion.md、
docs/superpowers/plans/2026-07-12-agent-hygiene-v1-completion.md 和设计规格。
先运行 git status --short、git log --oneline -8、pnpm check。
当前 MCP 基线到 bb102b9；不要重复旧 Task A-E。
从 Task G1 开始：先修复同一配置内多个同规则 MCP findings 的 instance ID 冲突，再处理 typed analyzer、credential value 预脱敏和共享 projection。
所有读取必须走 SafeFileSystem；不得访问网络、执行 MCP command、输出 secret 或绝对路径。
严格测试先行，每个阶段独立提交，并更新计划状态、测试数量、commit hash 和剩余事项。
```