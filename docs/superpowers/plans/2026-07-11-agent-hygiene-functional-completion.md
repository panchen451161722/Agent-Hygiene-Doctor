# Agent Hygiene CLI 功能补全执行计划

> 状态：执行中
> 目标：把当前可编译骨架推进为可验证的功能版本，补齐真实扫描、报告组合、setup 生命周期和发布验收。
> 基线：当前 `pnpm check` 通过，但 Tasks 7–14 仍有骨架实现；本计划不把“文件存在”视为功能完成。

## 执行规则

1. 每个阶段先写失败测试，再实现最小功能，再做独立复核。
2. 所有读取继续经过 `ScanContext`、`RootRegistry`、`SafeFileSystem` 和共享 semaphore。
3. 所有新增输出必须符合闭合的 `ReportV1`、`Diagnostic`、`InventoryItem` 契约。
4. 每个阶段独立提交；阶段验收失败时不进入下一阶段。
5. 任何 adapter 失败都只能影响自身 coverage，不能吞掉其他 adapter 的结果。

## Phase 0：建立真实基线

- [ ] 标注 Tasks 7–14 中的骨架 API 与缺失行为。
- [ ] 建立规格要求到测试文件的映射表。
- [ ] 修正计划状态，区分“已实现”“部分实现”“未实现”。
- [ ] 验证当前分支干净、`pnpm check` 通过。

验收：得到可追踪的剩余缺口清单，不改变公共报告契约。

## Phase 1：完成共享投影、规则和编排层

- [ ] 为 `src/inspectors/*.ts` 添加 skill/instruction/MCP/extension 的单元测试。
- [ ] 强制白名单投影，禁止 raw/error/stack/absolutePath/凭据值进入 inventory。
- [ ] 完成 `src/rules/catalog.ts` 的闭合 rule-id 集合和 manual steps。
- [ ] 为七类 analyzer 添加规则级测试、coverage 条件和确定性排序测试。
- [ ] 完成 `src/core/adapter.ts`、`orchestrator.ts` 的失败隔离、diagnostic 映射和 coverage 聚合。
- [ ] 添加 adapter contract 与 privacy regression tests。

验收：每个 rule-id 有测试；partial/unknown coverage 不产生 absence-based finding；单 adapter 失败不影响其他 adapter。

## Phase 2：实现 Codex adapter

- [ ] 实现 roots/config/instructions/adapter 的真实发现。
- [ ] 支持 `CODEX_HOME`、默认 home、项目链、profile、trust、MCP、skills、plugins、hooks。
- [ ] 实现 `AGENTS.override.md`、`AGENTS.md`、fallback 和目录层级优先级。
- [ ] 实现候选 profile、禁用 skill、trust unresolved、system skill coverage gap。
- [ ] 添加 POSIX/Windows fixtures、contract tests 和 no-read sentinel tests。

验收：Codex 报告的 SourceRef、排序、loading/status、coverage、diagnostics 稳定且 schema-valid。

## Phase 3：实现 Claude Code adapter

- [ ] 实现 user/project/local/managed settings precedence。
- [ ] 实现 CLAUDE.md、`.claude/CLAUDE.md`、local instructions 与五跳 import 限制。
- [ ] 实现 MCP、approval、skills、rules、plugins 和 activation 状态。
- [ ] 明确排除 transcripts/history/snapshots/memory/plugin data。
- [ ] 添加 POSIX/Windows fixtures、precedence/privacy contract tests。

验收：managed > unresolved CLI > local project > project > user 的规则可由 fixtures 重现。

## Phase 4：实现 Hermes adapter

- [ ] 实现 `HERMES_HOME`、平台默认目录、active profile 和候选 profile。
- [ ] 解析 config.yaml、MCP servers、external dirs、disabled entries。
- [ ] 实现 local-over-external skill precedence。
- [ ] 实现 plugins、项目插件环境门控、SOUL.md 和 unresolved activation。
- [ ] 添加 POSIX/Windows fixtures 与敏感文件 sentinel tests。

验收：Hermes 的 profile、skills、MCP、plugins、coverage 和 privacy contract 全部通过。

## Phase 5：完成 doctor 端到端组合

- [ ] 创建真实 ScanContext，注入 roots、limits、shared semaphore 和三类 adapter。
- [ ] 组合 orchestrator、analyzers、`buildReport`、redaction 和 reporters。
- [ ] 实现 terminal/JSON 输出、fail-on、agent-mode、verbose、stdout/stderr/exit code 语义。
- [ ] 添加 no-write/no-network/no-execution 集成测试。
- [ ] 验证单 adapter 失败隔离、partial coverage 和 absence-based rule 抑制。

验收：`doctor --agent-mode` 输出 schema-valid ReportV1；成功 JSON 模式不写默认 stderr。

## Phase 6：完成 setup 生命周期

- [ ] 实现三类 launcher destination 和 ownership manifest。
- [ ] 实现 dry-run、确认、force、uninstall、重复安装和冲突检测。
- [ ] 使用 atomic safe-write，严格限制到两个拥有文件。
- [ ] 添加损坏 manifest、未知内容、部分写入和 doctor regression tests。

验收：setup 只修改/删除已验证拥有的文件，其他文件字节级不变。

## Phase 7：发布候选和安全验收

- [ ] 完成 packed tarball 安装、bin 执行和 schema 校验。
- [ ] 验证 publish allowlist、Node 22、shebang 和跨平台 CI。
- [ ] 扫描源码、dist、终端、JSON、verbose logs、snapshots，确认无 seeded secret。
- [ ] 验证 packed doctor 无网络、无执行发现代码、不修改 fixture。
- [ ] 更新 README，使示例只描述已经实现的行为。
- [ ] 运行完整 `pnpm check`、pack verification 和最终安全断言。

验收：发布候选满足规格中的全部 release checklist。

## 当前执行顺序

1. Phase 0：基线审计与测试映射。
2. Phase 1：共享投影、规则、analyzer、orchestrator。
3. Phase 2–4：三个 agent adapter，彼此独立但共享相同 contract。
4. Phase 5：doctor 端到端组合。
5. Phase 6：setup 生命周期。
6. Phase 7：打包、安全和发布验收。
