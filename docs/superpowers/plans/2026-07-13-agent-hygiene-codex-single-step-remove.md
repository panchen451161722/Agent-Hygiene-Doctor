# Agent Hygiene Codex 单步交互删除调整计划

> 日期：2026-07-13
> 工作目录：`D:\project\agent-hygiene\.worktrees\agent-hygiene-v01`
> 当前版本：`1.2.0`
> 建议目标版本：`1.2.0`
> 实现状态：已完成并验证；仅使用临时 fixture，绝不修改真实 Agent 配置。

## 1. 目标

新增一个 Codex 专属的交互式快捷命令：

```powershell
agent-hygiene remove --codex
```

运行后只展示 Codex 的 Skill 与 MCP。用户使用空格勾选并按 Enter 后，CLI 在同一个进程中立即创建隔离事务并执行删除，不再要求复制 operation ID 或执行第二条删除命令。

`remove` 仍然表示“移动到可恢复隔离区”，不是永久删除。成功后必须输出 operation ID 和恢复命令：

```powershell
agent-hygiene restore <operation-id> --yes
```

## 2. 已确认的交互契约

正常流程：

```text
agent-hygiene remove --codex
  -> 扫描 Codex inventory
  -> 显示 Codex Skill/MCP 复选列表
  -> 用户空格勾选
  -> 用户按 Enter
  -> Enter 视为本次交互删除的明确确认
  -> 创建 planned operation
  -> 立即重验证并 apply
  -> 成功输出 applied operation 与恢复命令
```

终端示例：

```text
Select Codex items to quarantine
 ◉ skill agents-sdk — user — home:.agents/skills/agents-sdk/SKILL.md
 ◯ skill cloudflare — user — home:.agents/skills/cloudflare/SKILL.md
 ◉ mcp cloudflare — user — codex-home:config.toml

Quarantined 2 item(s).
Operation: 123e4567-e89b-42d3-a456-426614174000
Restore: agent-hygiene restore 123e4567-e89b-42d3-a456-426614174000 --yes
```

要求：

- 只显示 `agent === codex` 且 `kind === skill|mcp` 的 inventory。
- user/project 且 active/disabled 的条目可勾选。
- managed、system、plugin-owned、external、candidate、unresolved 条目可显示但必须禁用，并显示拒绝原因。
- Enter 后不再显示第二次确认，也不要求 `--yes`。
- 未选择任何条目、Esc、Ctrl+C 均不创建 operation、不修改文件。
- 成功退出码为 0；拒绝、过期、冲突或回滚失败退出码为 2。
- 输出不得包含绝对路径、配置值、token 或隔离备份内容。

## 3. 与现有命令的兼容关系

保留现有自动化与恢复接口：

```powershell
agent-hygiene remove --item <item-id> --dry-run
agent-hygiene remove <operation-id> --yes
agent-hygiene restore <operation-id> --yes
agent-hygiene operations
```

兼容原则：

- `agent-hygiene remove --codex` 是新的交互式单步快捷路径。
- `agent-hygiene remove --agent codex` 暂时保持现有“只生成计划”行为，避免破坏脚本和既有文档。
- `--codex --dry-run` 允许交互选择但只生成计划，不执行删除；输出必须明确写明 `Dry run: no files changed`。
- `--codex` 可与 `--kind skill|mcp`、`--project <dir>`组合。
- `--codex` 不得与 operation ID、`--agent`、`--item`、`--yes`、`--agent-mode` 或 `--format json` 组合；冲突时返回稳定参数错误。
- 非 TTY 使用 `--codex` 必须拒绝，不能自动选择或删除。
- 本阶段只新增 `--codex`；`--claude`、`--hermes` 留待后续用相同契约扩展。

## 4. 不降低的安全边界

单步仅合并用户操作，不删除内部两阶段事务：

```text
checkbox confirmation
  -> planRemoval(...)
  -> persisted planned operation
  -> applyRemoval(operationId)
  -> quarantine backup
  -> mutation
  -> post-image verification
  -> applied / automatic rollback
```

必须继续满足：

- 目标仍由 `itemId + agent + source + fingerprint` 精确锁定。
- Enter 后、写入前仍重新扫描并校验 pre-image。
- Skill 整目录必须先完整复制并校验隔离副本。
- 同一配置文件的多个 MCP 合并成一次备份和一次写入。
- 任一目标失败时回滚整个 operation。
- symlink、junction、reparse point、特殊文件和路径逃逸继续拒绝。
- planned operation 必须先持久化，随后才能 apply。
- 进程中断后 `operations` 仍能显示 planned/applying 状态。
- `restore` 的冲突检测、pre/post hash 和 journal 恢复逻辑不变。

## 5. 代码调整方案

### A. CLI 参数与模式判定

修改 `src/cli/manage.ts`：

- `PlanArguments` 增加 `codexShortcut: boolean`。
- `parsePlanArguments` 识别 `--codex`。
- 建立闭合的参数冲突校验函数。
- help 增加：

```text
agent-hygiene remove --codex [--kind skill|mcp] [--project <dir>] [--dry-run]
```

不要把 `--codex` 接入 commander 的 doctor/setup parser；remove 当前使用独立异步 parser，应在同一位置实现。

### B. 选择结果即确认

重构当前 `chooseItems`：

- 接受固定 `agents: ["codex"]`。
- prompt 标题改为 `Select Codex items to quarantine`。
- 返回已选 itemId；取消与空选返回显式取消结果，而不是创建空 operation。
- 保留 terminal control sanitization。

新增协调函数，名称可为：

```ts
planAndApplyInteractiveCodex(options, runtime)
```

职责：

1. 调用 Codex management scan。
2. 展示复选框。
3. 调用 `planRemoval` 持久化 operation。
4. `--dry-run` 时输出计划并停止。
5. 正常模式立即调用 `applyRemoval(store, operationId)`。
6. 输出删除摘要、operation ID 和 restore 命令。

`planRemoval`、`applyRemoval` 与事务模型不应为此复制实现。

### C. 输出

新增单步完成渲染：

```text
Quarantined <n> item(s).
Operation: <operation-id>
Restore: agent-hygiene restore <operation-id> --yes
```

失败输出只使用 cataloged `AH-REMOVE-*` 错误码。不得因便捷模式输出异常栈、绝对路径或源配置内容。

## 6. 测试计划

### 参数和 CLI 测试

- `remove --codex` 只扫描 Codex。
- `--codex --kind skill` 只列 Skill。
- `--codex --kind mcp` 只列 MCP。
- `--codex --project <dir>` 使用指定项目。
- `--codex --dry-run` 选择后不修改目标。
- `--codex` 与 `--agent`、`--item`、operation ID、`--yes`、JSON/agent mode 冲突时拒绝。
- 非 TTY 拒绝。
- Esc、Ctrl+C、空选不创建 operation。

### 集成测试

使用临时 HOME、CODEX_HOME 和 project fixture，不接触真实用户配置：

- 同时勾选一个 Codex Skill 和一个 Codex MCP，Enter 后两者立即进入隔离区。
- 命令结束后 operation 状态为 `applied`，无需执行第二条 remove 命令。
- restore 能恢复 Skill 全目录和 MCP 原始字节。
- 同一 config.toml 选择多个 MCP 时只产生一个备份。
- 选择后源内容变化时拒绝并保持原文件。
- 第二个目标写入失败时第一个目标自动回滚。
- managed/plugin-owned 条目无法勾选。
- 输出无 secret、绝对路径和终端控制字符。
- 中断后的 planned/applying operation 可由现有恢复机制识别。

### 测试可注入性

不要通过真实 raw TTY 驱动单元测试。将 checkbox 调用包装为可注入的 selection function，测试直接返回选中的 itemId；保留一个人工 Windows TTY smoke test验证方向键、空格、Enter 和 Ctrl+C。

## 7. 文档与发布

更新：

- `README.md`：把 `remove --codex` 作为推荐的 Codex 交互删除入口。
- `CHANGELOG.md`：记录单步交互删除及其仍可恢复的安全语义。
- `docs/MIGRATION-1.1.md` 或新增 1.2 migration：说明旧的 operation-ID 两步流程仍受支持。
- CLI help：说明 Enter 会立即移动选中项到隔离区。

不要写成永久删除，也不要声称 managed/plugin-owned 条目可自动删除。

## 8. 执行顺序

1. 先写参数冲突和非 TTY 失败测试。
2. 增加 `--codex` 解析与 help。
3. 抽取可注入 selection boundary。
4. 实现同进程 `planRemoval -> applyRemoval`。
5. 增加 Skill+MCP 单步集成测试。
6. 增加 stale、rollback、cancel、privacy 测试。
7. 更新 README、CHANGELOG 和迁移说明。
8. 运行 `pnpm check`、`pnpm verify-pack` 和 Windows 人工 TTY smoke test。
9. 每个阶段独立提交，最终确认 `git status --short` 无输出。

建议提交：

```text
test: define Codex single-step removal UX
feat: add Codex interactive removal shortcut
test: verify Codex single-step rollback and privacy
docs: document Codex single-step removal
```

## 9. 完成定义

- `agent-hygiene remove --codex` 只显示 Codex Skill/MCP。
- 用户勾选并按 Enter 后，正常路径不需要执行任何第二条删除命令。
- 内部仍创建 operation、隔离副本和事务 journal。
- 成功状态为 `applied`，输出 operation ID 与 restore 命令。
- 删除失败自动回滚，不留下半删除状态。
- 非 TTY、参数冲突、空选和取消均零写入。
- 原有非交互、operation ID 执行和 restore 命令保持兼容。
- `pnpm check`、`pnpm verify-pack`、Windows TTY smoke test通过。
- 真实用户 Skill/MCP 未被测试或开发流程修改。

## 10. 接手模型提示

本计划优先改变交互编排，不重写 planner、quarantine、transaction 或 restore。实现时必须复用现有 `planRemoval` 与 `applyRemoval`，并以测试证明“没有第二条删除命令”不等于绕过隔离、指纹校验和回滚。
