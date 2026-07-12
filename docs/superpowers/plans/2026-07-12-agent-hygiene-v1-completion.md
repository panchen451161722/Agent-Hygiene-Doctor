# Agent Hygiene CLI 1.0 完成交接计划

> 面向后续 Codex/Claude/GPT 等执行模型。
> 当前分支：`codex/agent-hygiene-v01`
> 当前包版本：`0.1.0`
> 目标版本：功能完整、可发布的 `1.0.0`
> 执行原则：测试先行、阶段独立提交、不得把骨架或投影 helper 视为 adapter 完成。

## 1. 当前真实基线

### 已完成且可复用

- 闭合的 `ReportV1`、JSON Schema、稳定排序和 ID。
- Windows/POSIX path dialect、RootRegistry、ScanContext、project root 选择。
- 有预算、并发限制和 link containment 的 SafeFileSystem。
- JSON/YAML/TOML 安全解析、深度/节点/alias 限制和最终 redaction。
- normalization、package runner、executable、MCP fingerprint 等规则原语。
- inspector 基础投影、adapter 失败隔离和部分 analyzer/catalog API。
- CLI 参数解析、schema-valid JSON 报告外壳、setup 确认边界。
- setup destination、launcher 文本、ownership hash 和注入式 safe-write helpers。
- 当前 `pnpm check` 通过；最近一次为 30 个测试文件、138 个测试。

### 只完成了部分功能

- Codex adapter 只读取项目 `AGENTS.override.md` / `AGENTS.md`。
- Claude adapter 只读取项目 `CLAUDE.md`。
- Hermes adapter 只读取 Hermes home 下的 `SOUL.md`。
- config/profile/MCP/skills/plugins/hooks 主要仍是纯投影 helper，没有真实发现。
- analyzer 文件多数仍共享一个“unresolved item”通用实现。
- doctor 已调用异步 adapters，但没有完整 analyzer/findings 组合、真实 duration 和 fail-on 语义。
- setup CLI 仍只输出成功文本，没有调用 destination + safe-write 执行真实安装或卸载。
- 打包能成功，但 packed install/bin/schema/no-network/no-write 验收未自动化。

### 必须先修复的架构债务

1. Runtime adapters 当前通过 `ScanContext.fs.readFile` 直接读取，必须改为共享 `SafeFileSystem`，否则违反设计的安全边界。
2. `runDoctor` 同步外壳与 `runDoctorAsync` 并存；应统一公共组合 API，CLI executable 只走一条路径。
3. setup manifest 尚未包含设计要求的 owner、packageName、packageVersion、skillSha256 闭合字段。
4. `installOwnedFiles` 把大部分 read 错误当作文件不存在；必须区分 ENOENT、权限错误和安全拒绝。
5. adapters 使用捕获所有异常表示“未发现”，必须把权限、parse、limit、unsafe reference 映射成 cataloged diagnostics。
6. `package.json`、README、schemaVersion 与发布版本升级策略尚未落实到 `1.0.0`。

## 2. 执行纪律

每个任务必须遵守：

1. 先添加会失败的测试并确认失败原因正确。
2. 只实现使该阶段测试通过的功能。
3. 运行目标测试、`pnpm typecheck`、`pnpm lint`。
4. 阶段结束运行 `pnpm check`。
5. 独立提交，不混入其他阶段代码。
6. 更新本计划 checkbox 和当前状态。
7. 未达到验收条件不得标记完成。

禁止事项：

- doctor 执行 Git、agent CLI、shell、插件代码或 discovered command。
- doctor 访问网络或写入扫描目录。
- 把绝对路径、raw error、stack、配置原文或凭据值放进 report。
- adapter 绕过 RootRegistry / SafeFileSystem。
- setup 删除或覆盖无法证明 ownership 的文件。

## 3. Task A：统一 runtime filesystem 和 doctor composition

### 文件

- 修改 `src/core/context.ts`
- 修改 `src/core/fs/safe-fs.ts`
- 修改 `src/core/adapter.ts`
- 修改 `src/core/orchestrator.ts`
- 重构 `src/cli/doctor.ts`
- 重构 `src/cli/main.ts`
- 添加 `test/unit/core/runtime-context.test.ts`
- 添加 `test/integration/doctor-no-write.test.ts`
- 添加 `test/integration/doctor-json.test.ts`

### 工作

- [ ] ScanContext 持有一个共享 SafeFileSystem/ScanIoSemaphore，不再暴露任意 `readFile` 给 adapter。
- [ ] 定义 adapter root admission API：primary root、typed directory、exact file、metadata-only executable。
- [ ] 统一同步/异步 doctor 组合；可测试 API 接受注入式 environment/cwd/fs/clock。
- [ ] adapter 结果经过 analyzers、buildReport、redactOutput、reporter。
- [ ] duration 使用注入 clock 计算。
- [ ] `--agent` 只运行选中的 adapter。
- [ ] doctor 集成测试证明扫描前后 fixture 哈希一致。

### 验收

- doctor 所有内容读取都可由 SafeFileSystem trace 证明。
- `doctor --agent-mode` 输出通过 report schema。
- 成功 JSON 模式 stderr 为空。
- 无网络、无子进程、无写入。

### 建议提交

`feat: unify safe runtime scan composition`

## 4. Task B：完成规则目录、inspectors 和 analyzers

### 文件

- 修改 `src/rules/catalog.ts`
- 修改 `src/rules/manual-steps.ts`
- 修改 `src/inspectors/*.ts`
- 重写 `src/analyzers/*.ts`
- 添加 `test/unit/analyzers/*.test.ts`
- 扩充 `test/unit/inspectors/*.test.ts`

### 工作

- [ ] 从设计规格列出闭合 rule-id、severity、title、impact、recommendation 和 actionable 规则。
- [ ] 每个 analyzer 只分析对应 facts，不使用同一个通用实现占位。
- [ ] 实现 configuration parse/read、filesystem limits、skill metadata/duplicates、MCP executable/pinning/credentials、context size、extensions activation、cross-agent duplicates。
- [ ] finding instanceId 只由稳定 evidence 构建。
- [ ] partial/unknown coverage 禁止 absence-based finding。
- [ ] manual steps 稳定、可操作且不包含 host path。
- [ ] inspector 递归隐私断言拒绝 raw/error/stack/absolutePath/credential value。

### 验收

- catalog 每个 rule-id 至少一个测试。
- analyzer 输出顺序与输入顺序无关。
- 所有 finding 通过 ReportV1 schema。

### 建议提交

`feat: complete deterministic hygiene analyzers`

## 5. Task C：Codex adapter 完整实现

### 文件

- 修改 `src/adapters/codex/roots.ts`
- 修改 `src/adapters/codex/config.ts`
- 修改 `src/adapters/codex/instructions.ts`
- 修改 `src/adapters/codex/adapter.ts`
- 新增需要的 `skills.ts` / `mcp.ts` / `extensions.ts`
- 扩充 `test/contract/codex-adapter.test.ts`
- 新增 `test/fixtures/codex/{posix,windows}/**`

### 工作

- [ ] 检测 `CODEX_HOME`、默认 home、project artifacts、metadata-only executable。
- [ ] 读取 user config、root-to-CWD `.codex/config.toml` / `hooks.json`。
- [ ] 投影 profile、project markers、project_doc、trust、MCP、skills、plugins、hooks。
- [ ] candidate profile 保持 unresolved，除非可静态确认 selected。
- [ ] global instruction override 选择和 root-to-CWD project instructions。
- [ ] 扫描 user/admin/plugin/project skills；同名 skill 默认均 active，除非明确 disabled。
- [ ] trust unknown 时 project `.codex` sources 为 unresolved。
- [ ] system bundled skills 记录 coverage gap，不猜测不存在。
- [ ] 绝不读取 auth、sessions、logs、history。

### 验收

- POSIX/Windows fixture contract 全过。
- trace 证明禁止目录未被读取。
- SourceRef、precedence、loading、status 和 diagnostics 稳定。

### 建议提交

`feat: complete Codex environment inspection`

## 6. Task D：Claude Code adapter 完整实现

### 文件

- 修改 `src/adapters/claude/*.ts`
- 扩充 `test/contract/claude-adapter.test.ts`
- 新增 `test/fixtures/claude/{posix,windows}/**`

### 工作

- [ ] 发现 `CLAUDE_CONFIG_DIR`、默认 home、project/local/managed settings。
- [ ] 实现 managed > unresolved CLI > local project > project > user scalar precedence。
- [ ] 实现 documented array merge/dedupe。
- [ ] 读取 managed MCP、project `.mcp.json` 和受限 `.claude.json` 投影。
- [ ] 读取 CLAUDE.md、`.claude/CLAUDE.md`、local instructions 和最多五跳 `@` imports。
- [ ] 发现 user/project/plugin skills、rules、hooks 和 plugin manifests。
- [ ] 排除 plugin data、transcripts、history、snapshots、memory 和 cache payloads。
- [ ] approval unknown 时相关 source/import 为 unresolved。

### 验收

- precedence、imports、approval、plugin activation 均有 contract tests。
- forbidden sentinel files 永不出现在 read trace/report。

### 建议提交

`feat: complete Claude Code environment inspection`

## 7. Task E：Hermes adapter 完整实现

### 文件

- 修改 `src/adapters/hermes/*.ts`
- 扩充 `test/contract/hermes-adapter.test.ts`
- 新增 `test/fixtures/hermes/{posix,windows}/**`

### 工作

- [ ] 发现显式 `HERMES_HOME`、POSIX/Windows defaults 和 documented fallback。
- [ ] 读取 config.yaml、sticky active_profile 和 immediate candidate profiles。
- [ ] 投影 MCP servers、enabled false、external skill directories。
- [ ] local skill 胜过 external duplicate；被覆盖 item 仍保留正确 status。
- [ ] 读取 plugins enabled/disabled，受环境变量门控的 project plugins。
- [ ] 读取 SOUL.md 和可选 MCP manifests。
- [ ] `.env` 依赖只能产生 unresolved activation，不读取 secret values。
- [ ] 禁止 OAuth/state/memory files。

### 验收

- POSIX/Windows contract 和 sentinel privacy tests 全过。
- profile、skills、MCP、plugins、coverage 稳定。

### 建议提交

`feat: complete Hermes environment inspection`

## 8. Task F：doctor CLI 1.0 行为

### 文件

- 修改 `src/cli/doctor.ts`
- 修改 `src/cli/main.ts`
- 修改 `src/reporters/json.ts`
- 修改 `src/reporters/terminal.ts`
- 添加 `test/integration/cli-doctor.test.ts`
- 添加 `test/integration/doctor-no-write.test.ts`

### 工作

- [ ] terminal reporter 显示 summary、coverage、findings、diagnostics 和 manual steps。
- [ ] JSON reporter 只输出闭合 ReportV1。
- [ ] `--fail-on error|warning` 实现退出码 0/1；fatal/usage 为 2。
- [ ] `--verbose` 只能增加 cataloged safe metadata。
- [ ] agent-mode 强制 JSON、无颜色、无交互。
- [ ] stdout/stderr 精确测试。
- [ ] 一个 adapter 失败不影响其他结果。

### 验收

- 所有 CLI 参数组合有 integration coverage。
- JSON 输出可重复、schema-valid、stderr 为空。
- terminal 输出不泄露 seeded secrets。

### 建议提交

`feat: finalize doctor CLI behavior`

## 9. Task G：setup 真实安装/卸载

### 文件

- 修改 `src/setup/destinations.ts`
- 修改 `src/setup/launcher.ts`
- 重写 `src/setup/manifest.ts`
- 重写 `src/setup/safe-write.ts`
- 修改 `src/cli/setup.ts`
- 添加 `test/integration/setup-lifecycle.test.ts`

### Manifest 1.0 闭合格式

```ts
interface LauncherManifestV1 {
  owner: "agent-hygiene-cli";
  schemaVersion: 1;
  packageName: "agent-hygiene-cli";
  packageVersion: "1.0.0";
  skillSha256: string;
}
```

### 工作

- [ ] setup CLI 创建真实 ScanContext 并解析 agent destinations。
- [ ] 默认 dry-run/TTY prompt/non-TTY `--yes` 语义明确。
- [ ] launcher 精确使用 `agent-hygiene-cli@1.0.0`。
- [ ] 安装顺序：exclusive temp -> flush/close -> SKILL rename -> manifest last。
- [ ] `--force` 只能替换可验证 owned install。
- [ ] uninstall 重新 hash exact bytes，只删除 SKILL.md 和 manifest。
- [ ] modified-owned、unknown-owned、symlink/junction/ADS/device path 一律拒绝。
- [ ] directory 仅在空目录时删除。

### 验收

- interruption、conflict、repeat install、force、hash mismatch、uninstall 均有集成测试。
- 目标目录之外所有文件保持字节级不变。

### 建议提交

`feat: finalize owned launcher lifecycle`

## 10. Task H：1.0 打包、CI 和发布验收

### 文件

- 修改 `package.json`
- 修改 `README.md`
- 修改 `.github/workflows/ci.yml`
- 重写 `scripts/verify-pack.mjs`
- 添加 packed/no-network/no-write integration tests

### 工作

- [ ] 仅在所有功能验收后将版本改为 `1.0.0`。
- [ ] 更新 lockfile 和 launcher version expectations。
- [ ] `verify-pack.mjs` 创建 tarball、安装到临时目录并运行 bin。
- [ ] packed bin 与 tarball `npx` 均输出 schema-valid JSON。
- [ ] tarball 只包含 files allowlist。
- [ ] Windows/macOS/Linux + Node 22 CI。
- [ ] 扫描源码、dist、JSON、terminal、verbose logs、snapshots，确认无 seeded secret。
- [ ] packed doctor 禁止网络、子进程和写入 fixture。
- [ ] README 只描述已实现功能，提供：
  `npx -y agent-hygiene-cli@1.0.0 doctor --agent-mode`

### 最终验收命令

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack
node scripts/verify-pack.mjs
```

### 建议提交

`release: prepare Agent Hygiene CLI 1.0.0`

## 11. 并行执行边界

可并行：

- Task C、D、E 三个 adapter，各自只改对应 adapter 和 fixtures。
- Task B analyzers 与 Task G setup，在公共类型稳定后可并行。
- Task H 的 CI/pack script 可先写失败测试，但版本升级必须最后进行。

必须串行：

1. Task A runtime 安全边界。
2. Task B 公共 facts/rules 契约。
3. Tasks C/D/E adapters。
4. Task F doctor 组合。
5. Task G setup 实际写入。
6. Task H release。

共享文件冲突高风险：

- `src/core/context.ts`
- `src/core/inventory.ts`
- `src/core/diagnostic.ts`
- `src/core/report.ts`
- `src/cli/main.ts`
- `package.json`

同一时间只允许一个执行者修改这些文件。

## 12. 交接给其他模型时的起始指令

建议直接提供：

```text
阅读 docs/superpowers/specs/2026-07-10-agent-hygiene-cli-design.md、
docs/superpowers/plans/2026-07-10-agent-hygiene-cli.md 和
2026-07-12-agent-hygiene-v1-completion.md。
从第一个未完成 Task 开始，先运行 git status 和 pnpm check。
严格 TDD；每个 Task 单独提交；不得把骨架视为完成。
完成后更新计划 checkbox、报告测试数量和提交 hash。
```

## 13. Definition of Done：Agent Hygiene CLI 1.0

只有全部满足时才能宣布 1.0 完成：

- [ ] 所有内容读取经过 SafeFileSystem 和共享 semaphore。
- [ ] Codex/Claude/Hermes POSIX + Windows contract tests 全通过。
- [ ] config/instructions/skills/MCP/plugins/extensions 全部产生正确 inventory facts。
- [ ] 所有 catalog rules 有确定性 analyzer tests。
- [ ] partial/unknown coverage 不产生 absence-based recommendation。
- [ ] 一个 adapter 失败不 suppress 其他 adapter。
- [ ] doctor 不写磁盘、不访问网络、不执行 discovered code。
- [ ] JSON schema-valid；成功 JSON 模式 stderr 为空。
- [ ] setup 只操作两个 verified owned files。
- [ ] setup/uninstall 的 conflict/interruption/hash mismatch tests 全通过。
- [ ] source/dist/report/log/snapshot 中无 seeded secret。
- [ ] packed tarball install/bin/npx tests 全通过。
- [ ] Windows/macOS/Linux Node 22 CI 全绿。
- [ ] package version、README、launcher、manifest 均为 `1.0.0`。
- [ ] `pnpm check` 和最终 release verification 全绿。
- [ ] Git 工作区干净，release commit 已创建。
