# Agent Hygiene 1.0 收尾执行计划

> 日期：2026-07-13  
> 工作目录：`D:\project\agent-hygiene\.worktrees\agent-hygiene-v01`  
> 分支：`codex/agent-hygiene-v01`  
> 代码基线：`a889025 feat: resolve MCP commands without execution`  
> 验证基线：33 个测试文件、171 项测试，`pnpm check` 通过  
> 目标读者：接手开发的 Codex、Claude、GPT 或其他编码模型

## 1. 最终目标

把当前可试用的 `0.1.0` 完成到可以宣布“1.0 功能与发布验收完成”的状态。

本计划只包含真实剩余工作。不要重新实现已经提交的 MCP projection、finding identity、typed analyzer、credential value 预丢弃、Claude managed sources、Hermes profiles 或 duplicate endpoint analyzer。

完成后必须满足：

- Codex、Claude、Hermes 的规定 MCP 来源可被安全发现；
- MCP command 只做元数据解析，绝不执行；
- terminal、JSON、agent-mode、findings 不泄漏 secret 或绝对路径；
- 扫描不写文件、不访问网络、不启动 discovered command；
- SafeFileSystem 失败产生确定性 diagnostics，并保持诚实 coverage；
- 发布包经过真实 tarball 安装与真实 `agent-hygiene` bin 验证；
- `pnpm check`、pack verification 和人工 CLI smoke test 全部通过；
- Git 工作树干净。

## 2. 接手前必须确认的事实

先执行：

```powershell
cd D:\project\agent-hygiene\.worktrees\agent-hygiene-v01
git status --short
git log --oneline -8
pnpm check
```

期望：

- `git status --short` 无输出；
- HEAD 至少包含 `a889025`；
- 33 个测试文件、171 项测试通过。测试数量后续可以增加；
- package version 当前仍为 `0.1.0`，不要在功能与发布验收完成前改版本。

如果基线不同，先审计差异，不要 reset、checkout 或覆盖用户改动。

## 3. 已完成基线，不得重做

以下工作已经提交并通过测试：

| 能力 | 提交 |
|---|---|
| honest partial coverage | `965ed21` |
| Codex MCP discovery | `fddd354` |
| MCP findings 与 fail-on | `3d92ebc` |
| Claude/Hermes 基础 MCP discovery | `fadaec6` |
| 唯一 MCP finding identity | `2eb0d32` |
| typed configuration analyzer | `13ba49d` |
| inspector 前丢弃 credential values | `20235b3` |
| shared MCP projection | `1c47cd8` |
| MCP edge cases | `a15b02b` |
| Claude managed sources/precedence | `074d4f4` |
| Hermes optional/profile candidates | `dc92ae6` |
| Claude `.claude.json` immediate MCP | `aaac29d` |
| duplicate active MCP endpoints | `3183682` |
| metadata-only MCP command resolution | `a889025` |

关键现状：

- `src/rules/executable.ts` 已经存在纯元数据 executable resolver，并已有 POSIX、Windows PATHEXT 和 unknown 单测；剩余工作是安全接入扫描和 finding。
- `src/adapters/shared/mcp.ts` 已只保留 env/header 字段名，不向 inspector 传值。
- `src/analyzers/mcp.ts` 已有 unpinned、plaintext、credential-field、transport-unknown、duplicate-endpoint。
- `scripts/verify-pack.mjs` 目前只直接运行 `dist/cli/main.js`，不能算发布验收。
- 旧计划 `2026-07-13-agent-hygiene-mcp-completion.md` 的 Task G 明细存在未同步勾选；不要据此重复开发。

## 4. 不可违反的边界

- doctor 不访问网络。
- doctor 不执行 MCP command、package runner、hook、plugin 或 shell。
- 内容读取必须经过共享 `SafeFileSystem` 和共享 semaphore。
- executable resolution 只允许 metadata 查询，不读取可执行文件内容。
- report/inventory/finding 不保存或输出 raw environment value、header value、token、URL query value、URL userinfo、完整绝对路径或 parser stack。
- executable resolver 可以内部得到 candidate path，但只能向 inventory 输出 `resolved | not-found | unknown`。
- optional source 不存在不是 warning；unsafe、special-file、limit-exceeded 等真实扫描失败才进入 diagnostic。
- partial/unknown coverage 不允许产生 absence-based finding。
- 不读取 Claude history/transcripts/snapshots/memory/cache。
- 不读取 Hermes `.env`、OAuth token、state database 或 memory 内容。
- 不用真实用户目录做隐私测试；使用临时 fixture 与注入 backend。
- 不修改、删除或迁移真实用户配置。

## 5. 执行顺序

严格按 A → B → C → D → E → F 执行。每个阶段测试先行、单独提交。

---

## A. 接入 metadata-only MCP command resolution

### A1. 设计约束

复用 `src/rules/executable.ts`，不要另写第二套 PATH/PATHEXT 算法。

需要建立一个受控接入点，满足：

- 使用注入 filesystem；
- 所有 metadata 调用经过共享 semaphore；
- 支持 scan platform、selected working directory、`PATH`、`PATHEXT`；
- adapter/inspector 只收到 resolution status；
- 不把 resolved path 加入 `McpFacts`；
- 空 PATH segment、缺少 PATHEXT、平台语义不确定时返回 unknown；
- 只有确定检查完候选项后才返回 not-found。

推荐实现方向：

1. 在 `SafeFileSystem` 增加只返回状态的 metadata API，内部调用现有 resolver；或新增由 `createScanContext` 注入、共享 semaphore 的闭合 resolver service。
2. 不把 raw `FsBackend` 暴露给 adapter。
3. 在 shared MCP projection 与 adapter 之间增加异步 enrichment，给 stdio `McpInput.commandResolution` 赋值。
4. HTTP/SSE 不做 command lookup。
5. candidate、disabled 和 unresolved MCP 可以保留 unknown；不要因此产生 not-found finding。

### A2. 修改范围

优先检查和修改：

- `src/rules/executable.ts`
- `src/core/fs/safe-fs.ts`
- `src/core/context.ts`
- `src/adapters/shared/mcp.ts`
- `src/adapters/codex/adapter.ts`
- `src/adapters/claude/adapter.ts`
- `src/adapters/hermes/adapter.ts`
- `src/inspectors/mcp.ts`
- `src/analyzers/mcp.ts`
- `src/rules/manual-steps.ts`

### A3. 必须新增的测试

- resolver 的 absolute、relative、PATH、空 PATH segment、Windows case/PATHEXT、POSIX executable bit。
- metadata 调用经过同一个 semaphore；不得调用 `openRegularFile`。
- adapter contract：存在命令 → resolved；确定缺失 → not-found；语义不足 → unknown。
- analyzer：
  - active + not-found → `mcp-command-not-found`；
  - unknown/resolved/disabled/unresolved/candidate → 不产生该 finding；
  - evidence 使用 MCP item ID；
  - finding ID 与输入顺序稳定。
- JSON/terminal 中不得出现 resolved absolute path。

### A4. 阶段验收

```powershell
pnpm exec vitest run test/unit/rules/executable.test.ts
pnpm exec vitest run test/unit/analyzers/mcp.test.ts
pnpm exec vitest run test/contract/live-adapters.test.ts
pnpm check
git diff --check
```

建议提交：

```text
feat: resolve MCP commands without execution
```

---

## B. 完成 Claude/Hermes activation 边界

### B1. Claude project approval

目标：project `.mcp.json` 的启用状态只有在受限 `~/.claude.json` 非秘密 approval state 能被静态证明时才标 active；无法证明时标 unresolved。

要求：

- 只投影 documented approval boolean/state；
- 不保存 project absolute path到 report；
- 不投影应用文件中与 MCP/approval 无关的数据；
- managed/local/shared/user 的声明继续分别保留；
- 同名 server 不被 Map 覆盖；
- 高优先级 source 的 shadowing 保持确定性；
- approval unknown 不生成“命令不存在”等后续误报。

如无法从现有规格确定 `.claude.json` approval shape，先在设计规格中补充闭合 fixture shape，再实现；不要猜测并扫描任意嵌套对象。

### B2. Hermes environment-dependent activation

目标：识别 `config.yaml` 中明确的环境引用，但绝不读取或 source `.env`。

要求：

- 只根据配置文本中允许的引用语法判断 activation dependency；
- 依赖未知环境值的 MCP 标 unresolved；
- optional manifests 始终 candidate；
- sticky active profile 保持 unresolved，sibling profiles 保持 candidate；
- 不读取 `.env`、OAuth、state.db、memory。

### B3. 契约测试

新增 fixture/backend trace，证明：

- Claude 未知 approval → project MCP unresolved；
- approved fixture → active；
- managed 同名定义仍正确 shadow lower precedence；
- Hermes env-dependent MCP → unresolved；
- read trace 中没有 history、transcript、snapshot、memory、cache、`.env`、OAuth、state.db；
- profile duplicate server 保留所有 items，只有 active items进入 duplicate warning。

建议提交：

```text
fix: model MCP activation boundaries
```

---

## C. SafeFileSystem diagnostics 与 coverage

当前 adapter 对大量非 ok 读取直接 return，可能静默吞掉真实安全/预算失败。

### C1. 建立统一映射

实现共享 helper，将 SafeFileSystem failure 映射为 cataloged diagnostics：

- `limit_exceeded` → `AH-FS-002`，coverage 必须 partial；
- `unsafe_reference` → `AH-FS-001`；
- `special_file` → `AH-FS-001`；
- optional source 的 `not_found` → 静默忽略；
- 已发现后读取失败的 not_found/read error 如无法区分，先扩展 safe result 的闭合 code，不输出 raw error。

要求：

- diagnostic 只能包含 root alias/relative SourceRef；
- 不含绝对路径、stack、原始系统错误；
- adapter 某个 source 失败不阻止其他 source/agent；
- coverage 不能因为找到一个文件就变 complete；
- 没有足够证据时保持 partial/unknown。

### C2. 测试

- unsafe symlink/special file/limit exhaustion；
- 一个 adapter 抛错时其他 adapter 结果仍进入 report；
- diagnostics code、severity、排序稳定；
- terminal 和 JSON 均显示 diagnostics；
- optional missing files不制造噪音。

建议提交：

```text
fix: report safe scan failures and coverage
```

---

## D. Privacy、read-only、no-network、no-subprocess 验收

建立一个集成测试文件，例如：

```text
test/integration/mcp-safety-boundaries.test.ts
```

### D1. Secret sentinel

在 fixture 中放入同一个高辨识度 sentinel：

- stdio env value；
- HTTP header value；
- URL userinfo/query/fragment；
- opaque args value；
- Claude application file的无关字段；
- Hermes env-like config。

断言 sentinel 不出现在：

- adapter result；
- inventory；
- finding；
- terminal；
- `--format json`；
- `--agent-mode`；
- snapshots；
- thrown error/stderr。

注意：opaque args 参与 fingerprint 时只能保留 argument shape/recognized package spec，不能保留任意值。

### D2. Read trace

用 tracing backend 记录每次 `lstat`、`realpath`、`readDirectory`、`openRegularFile`。

断言：

- 只读取 allowlisted source；
- 禁止目录/文件从未进入 `openRegularFile`；
- executable resolution 只调用 metadata，不打开文件；
- 不扫描 history/session/log/auth/OAuth/state/memory/cache；
- 不读取 `.env`。

### D3. No side effects

- fixture 扫描前后递归 byte hash 相同；
- 注入 network/subprocess traps，doctor 流程不得调用；
- discovered command 用会产生标记文件的假命令，扫描后标记文件不存在；
- 一个 adapter 失败不影响其他 adapter。

建议提交：

```text
test: verify MCP privacy and read-only boundaries
```

---

## E. 真实 packed-bin 发布验收

重写 `scripts/verify-pack.mjs`。当前直接运行 `dist/cli/main.js` 的实现必须删除。

### E1. 推荐流程

脚本在临时目录中：

1. 运行 build；
2. 运行 pack，取得 tarball 路径；
3. 检查 tarball file allowlist；
4. 创建隔离 npm project；
5. 安装本地 tarball，不访问网络；
6. 解析安装后的 `node_modules/.bin/agent-hygiene`；
7. 通过真实 bin 执行 fixture；
8. 清理临时目录（即使测试失败）。

不要依赖全局 link，也不要调用源码 `dist/cli/main.js`。

### E2. 必须验证

- `agent-hygiene doctor --project <fixture>` terminal 有 MCP inventory；
- `--format json` 可被 schema 校验；
- `--agent-mode` 可被 schema 校验；
- warning + 默认 `--fail-on error` → exit 0；
- warning + `--fail-on warning` → exit 1；
- fatal usage/project error → exit 2；
- 成功路径 stderr 为空；
- fatal 信息不污染 stdout；
- 输出不含 sentinel secret 和临时绝对路径；
- tarball 只含 package.json、dist、schema、README.md、LICENSE 等 allowlist；
- `package.json.bin.agent-hygiene` 指向实际存在且可执行的构建文件。

建议同时在 `package.json` 增加：

```json
{
  "scripts": {
    "verify:pack": "node scripts/verify-pack.mjs"
  }
}
```

测试 fixture 统一使用：

```text
test/fixtures/mcp-project
```

建议提交：

```text
test: verify installed agent hygiene package
```

---

## F. 1.0 最终审计与文档收口

只有 A–E 全部通过后执行。

### F1. 同步文档

更新：

- `README.md`
- `docs/superpowers/plans/2026-07-13-agent-hygiene-mcp-completion.md`
- 本计划
- 必要的 schema/version 文档

要求：

- 删除“从 Task G1 开始”等过期启动指令；
- 已完成条目全部勾选并写入 commit；
- 明确当前 coverage 仍为 partial 的原因；
- README 命令必须通过 installed-bin smoke test；
- 不写尚未实现的承诺。

### F2. 版本决策

功能和发布验收全部通过后，再决定：

- 保持 package 技术版本 `0.1.0`，仅宣布“首个可用版本”；或
- 按用户明确授权升级 package version。

不要擅自发布 npm、push、创建 release 或打 tag。

### F3. 最终验证矩阵

```powershell
git status --short
pnpm check
pnpm run verify:pack
pnpm build
node .\dist\cli\main.js doctor --agent codex
node .\dist\cli\main.js doctor --agent codex --format json
node .\dist\cli\main.js doctor --agent claude
node .\dist\cli\main.js doctor --agent hermes
node .\dist\cli\main.js doctor --agent-mode
node .\dist\cli\main.js doctor --project .\test\fixtures\mcp-project --agent codex --fail-on warning
git diff --check
git status --short
```

最后一条 `git status --short` 必须无输出。

建议提交：

```text
docs: finalize agent hygiene 1.0 readiness
```

## 6. 每阶段工作纪律

每个阶段都遵守：

1. 先写会失败的目标测试，确认失败原因正确。
2. 只实现当前阶段，不夹带重构。
3. 运行 focused tests。
4. 运行 `pnpm check`。
5. 运行 `git diff --check`。
6. 检查 `git status --short`，只 stage 当前阶段文件。
7. 单独 commit。
8. 在本计划记录 commit、测试数量和剩余项。
9. 不使用 `git reset --hard`、`git checkout --` 或覆盖用户改动。

如果发现规格与现实冲突：

- 先记录冲突和证据；
- 选择不扩大权限、不会泄密的保守行为；
- 将结果标 unresolved/partial；
- 不用猜测替代闭合规格。

## 7. 完成定义

以下全部勾选后才能宣布完成：

- [ ] A：metadata-only command resolution 已接入，not-found finding 正确。
- [ ] B：Claude approval 与 Hermes env-dependent activation 边界完成。
- [ ] C：SafeFileSystem diagnostics 与 honest coverage 完成。
- [ ] D：privacy/read-trace/no-write/no-network/no-subprocess 验收完成。
- [ ] E：真实 tarball 安装与 installed bin 验收完成。
- [ ] F：README、计划和最终验证矩阵完成。
- [ ] `pnpm check` 通过。
- [ ] `pnpm run verify:pack` 通过。
- [ ] Git 工作树干净。
- [ ] 未执行 npm publish、push、tag 或 release。

## 8. 可直接复制给下一模型的启动指令

```text
在 D:\project\agent-hygiene\.worktrees\agent-hygiene-v01 工作，分支 codex/agent-hygiene-v01。
先完整阅读：
1. docs/superpowers/plans/2026-07-13-agent-hygiene-v1-finalization.md
2. docs/superpowers/specs/2026-07-10-agent-hygiene-cli-design.md
3. README.md

先运行 git status --short、git log --oneline -8、pnpm check。
真实基线是 3183682，32 个测试文件、170 项测试通过。
不要从旧 Task G1 重做；finding identity、typed analyzer、credential pre-discard、shared projection、Claude managed sources、Hermes profile candidates 和 duplicate endpoint 已完成。

严格从新计划 Task A 开始：复用 src/rules/executable.ts，把 metadata-only command resolution 安全接入 SafeFileSystem/ScanContext 和三个 adapter，只输出 resolved/not-found/unknown，绝不执行命令、打开 executable 内容或输出 resolved path。
测试先行，每个阶段独立提交；每阶段运行 focused tests、pnpm check、git diff --check，并更新计划中的 commit、测试数和剩余项。
所有内容读取必须走 SafeFileSystem；不得读取 secret/history/transcripts/.env/OAuth/state/memory，不得访问网络、执行 discovered command、发布、push 或打 tag。
```

