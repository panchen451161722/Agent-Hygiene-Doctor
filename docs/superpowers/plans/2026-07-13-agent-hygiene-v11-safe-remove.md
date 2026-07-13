# Agent Hygiene 1.1 安全删除与恢复执行计划

> 日期：2026-07-13
> 工作目录：`D:\project\agent-hygiene\.worktrees\agent-hygiene-v01`
> 分支：`codex/agent-hygiene-v01`
> 前置条件：先完成并发布 1.0 的只读扫描、隐私、安全边界与发布验收
> 目标版本：1.1
> 目标读者：接手开发的 Codex、Claude、GPT 或其他编码模型

## 1. 已确认的产品决策

- 本功能属于 1.1，不扩大 1.0 的范围。
- 支持交互式复选框选择，也支持复制 `itemId` 的非交互模式。
- `remove` 的含义是移动到隔离区，不做不可恢复的永久删除。
- 第一版只提供 `remove`，不单独提供 `disable`。
- Skill 删除整个 Skill 目录，包括脚本、资源和其他子文件。
- 允许修改用户和项目范围的配置；managed、system、plugin-owned 来源拒绝自动修改。
- MCP 修改必须尽量保留原格式、注释和未选中节点的原始字节。
- 每次操作必须创建可恢复的隔离副本。
- 非交互执行必须同时提供精确 operation ID 和 `--yes`。
- 执行失败或执行后验证失败时自动回滚整个操作。
- 支持在交互界面中复选多个 Skill/MCP，作为一个事务计划执行。
- `agent-hygiene remove <operation-id> --yes` 执行已生成的删除计划。
- `agent-hygiene restore <operation-id> --yes` 恢复整个操作。

## 2. 核心安全模型

`doctor` 必须继续保持完全只读。所有写入只允许发生在新的 `remove`、`restore` 命令以及已有的 `setup` 命令中。

删除采用严格的两阶段流程：

```text
doctor inventory
  -> 用户选择 itemId
  -> 生成不可变 removal plan 和 operation-id
  -> 显示准确影响范围
  -> remove <operation-id> --yes
  -> 重新扫描并校验文件指纹
  -> 创建隔离副本并校验副本
  -> 写入事务日志
  -> 应用配置补丁/移除 Skill 目录
  -> 再次扫描验证
  -> 成功提交，失败自动补偿回滚
```

不可违反的规则：

- 不允许按名称模糊删除；执行目标必须由 `itemId + agent + source + fingerprint` 共同锁定。
- 计划生成后源文件、目录或配置节点发生变化时必须拒绝执行。
- `--force` 不得绕过指纹变化、所有权、scope、链接或恢复冲突检查。
- 不递归跟随 symlink、junction、reparse point 或其他特殊文件。
- managed、system、plugin、候选外部来源默认只能输出手工步骤。
- 删除计划、终端和 JSON 输出不得包含配置值、token、完整绝对路径或隔离备份内容。
- 本地事务 manifest 可以保存恢复所需的物理路径，但不得进入 doctor/report 输出；目录权限必须限制为当前用户。
- 同一配置文件中的多个 MCP 删除必须合并成一次补丁和一次备份。
- 多目标操作要么全部成功，要么自动恢复到操作前状态。

## 3. CLI 契约

### 3.1 交互式生成计划

```powershell
agent-hygiene remove
agent-hygiene remove --agent codex
agent-hygiene remove --kind skill
agent-hygiene remove --kind mcp
```

要求：

- 只在真实 TTY 中显示复选框；空格切换、方向键移动、Enter 确认。
- 列表显示 agent、kind、name、scope、status、安全 SourceRef，不显示绝对路径。
- managed/system/plugin-owned 条目可显示，但不可勾选，并解释原因。
- 选择完成后只生成计划，不立即写入 agent 配置。
- 输出 operation ID、影响摘要，以及执行命令：

```powershell
agent-hygiene remove <operation-id> --yes
```

建议使用维护活跃且支持 Node 22/Windows 的 checkbox prompt 库；引入前必须完成依赖与打包 spike。不要自行实现不完整的 raw-mode 终端状态机。

### 3.2 非交互式生成计划

```powershell
agent-hygiene remove --item <item-id> --item <item-id> --dry-run
```

要求：

- 非 TTY 且没有 `--item` 时退出码为 2。
- `--item` 可重复。
- `--dry-run` 执行完整扫描、选择、预检和补丁计算，并持久化 planned operation，但不修改目标。
- JSON/agent mode 输出闭合 schema，包括 operation ID、可执行/拒绝项目和安全摘要。

### 3.3 执行删除计划

```powershell
agent-hygiene remove <operation-id> --yes
```

要求：

- operation ID 必须存在且状态为 `planned`。
- `--yes` 必须存在；缺失时不得修改任何文件。
- 执行前重新扫描并重新计算所有指纹。
- 不允许通过命令行临时增加目标；目标只能来自已保存计划。
- 成功后状态为 `applied`，输出恢复命令。

### 3.4 恢复

```powershell
agent-hygiene restore <operation-id> --yes
```

要求：

- 只恢复状态为 `applied` 的完整 operation。
- 恢复前验证当前状态等于 removal 后记录的 post-image hash。
- 当前文件或目录被用户修改时拒绝恢复，不允许 `--force` 覆盖。
- 恢复成功后状态为 `restored`，保留审计 manifest。
- 恢复失败时保持隔离副本，不做半恢复。

### 3.5 查询操作

1.1 同时提供只读查询：

```powershell
agent-hygiene operations
agent-hygiene operations --format json
```

只输出 operation ID、时间、状态、条目数量和安全 SourceRef 摘要，不输出物理路径或备份内容。

## 4. 隔离区与事务模型

默认隔离根：

- POSIX：`$HOME/.agent-hygiene/quarantine/`
- Windows：`%LOCALAPPDATA%\agent-hygiene\quarantine\`；缺失时回退到 `%USERPROFILE%\.agent-hygiene\quarantine\`

每个 operation 使用：

```text
quarantine/<operation-id>/
  manifest.json
  journal.json
  backups/
    source-0001.bin
    skill-0002/
```

`manifest.json` 使用闭合、版本化 schema，至少包含：

- schemaVersion、operationId、toolVersion、createdAt、status；
- selected itemId、agent、kind、scope、status、SourceRef；
- 内部 original physical path；
- pre-image hash、planned post-image hash、实际 post-image hash；
- backup relative path、backup type、byte/file count；
- MCP 配置节点的闭合 locator；
- 拒绝原因或恢复冲突码。

文件权限要求：

- POSIX 目录 `0700`、文件 `0600`。
- Windows 只继承当前用户私有目录 ACL，不主动放宽权限。
- 临时文件只能创建在 operation 目录内，写完、校验后原子 rename。
- manifest 最后写入；不完整目录不能被当作可恢复 operation。

事务状态机：

```text
planned -> applying -> applied -> restoring -> restored
                   \-> rollback -> rolled_back
                   \-> failed
```

进程崩溃后，下次 `operations` 必须识别 `applying/restoring` 并只提供安全恢复或报告，不自动猜测完成状态。

## 5. Skill 删除实现

目标目录由 inventory 中 `SKILL.md` 的父目录推导，但必须重新经过专用写入边界验证。

预检：

- scope 只能是 user 或 project；拒绝 managed/plugin/external/system。
- `SKILL.md` 必须仍是普通文件，内容 fingerprint 与计划一致。
- Skill 根目录的 canonical path 必须位于对应 admitted writable root 内。
- 递归枚举受文件数、字节数和深度限制约束。
- 任意 symlink、junction、reparse point、FIFO、device 或特殊文件都会拒绝整个 Skill。
- 不允许目标目录等于 agent skill 根、用户目录或项目根。

执行：

1. 将整个目录复制到 operation 临时隔离目录。
2. 对相对路径、文件类型、大小和 SHA-256 进行 manifest 化并复核。
3. 只有完整副本验证成功后才删除原目录。
4. 删除后确认目标不存在并重新运行受影响 adapter。
5. 失败时从隔离副本恢复原目录。

不要调用 shell 的递归删除命令；实现使用受控 Node filesystem API 和逐项边界检查。

## 6. MCP 删除实现

支持的 1.1 source：

| Agent | 可修改来源 | 节点 locator |
|---|---|---|
| Codex | user/project `config.toml` | `mcp_servers.<name>` |
| Claude | user/project `.mcp.json`、settings JSON、受限 `~/.claude.json` MCP 节点 | `mcpServers.<name>` |
| Hermes | active-home `config.yaml` | `mcp_servers.<name>` |

拒绝：managed MCP、managed settings、optional catalog、profile candidate、plugin-owned、无法证明 activation/ownership 的来源。

格式保留策略：

- JSON/JSONC：使用基于 source edit 的解析器，只删除目标 property range；不得 `JSON.stringify` 整份配置。
- YAML：使用现有 `yaml` Document/CST 能力删除目标 pair，保留注释并验证其余语义不变。
- TOML：先做依赖 spike；推荐使用能提供 AST range/comment 的解析器定位准确 table range，再做文本 edit，并用现有 `smol-toml` 重新解析验证。不得按正则猜测 TOML table 边界。
- 修改前保存整个源文件原始 bytes；恢复使用完整 pre-image。
- 修改后重新解析并证明：只有选中 MCP 节点消失，其他 projected MCP 和非 MCP 白名单投影不变。
- 如果不能安全定位、存在重复键、语法扩展不受支持或注释无法可靠保留，则拒绝自动修改并给出手工步骤。

`.claude.json` 可能含敏感应用状态：备份文件不得被解析后重写，不得输出内容，只允许对已确认的 `mcpServers.<name>` source range 做最小 edit。

## 7. 建议代码结构

```text
src/manage/
  model.ts
  operation-id.ts
  operation-store.ts
  selection.ts
  planner.ts
  preflight.ts
  transaction.ts
  quarantine.ts
  restore.ts
  writable-roots.ts
  skill-remover.ts
  mcp/
    locator.ts
    json-editor.ts
    yaml-editor.ts
    toml-editor.ts
src/cli/
  remove.ts
  restore.ts
  operations.ts
schema/
  operation-v1.schema.json
```

不要复用 read-only `SafeFileSystem` 承担写入。建立单独的 `SafeMutationFileSystem`，共享 path dialect、root registry 和路径策略，但只暴露本功能需要的闭合操作。

## 8. 分阶段执行计划

### A. 规格、CLI 和 operation schema

- 将本计划的已确认决策同步到正式设计规格。
- 增加 remove/restore/operations CLI parser，仅实现 dry-run/display。
- 定义 operation manifest、状态机、错误码和 JSON schema。
- 测试 TTY/非 TTY、重复 `--item`、operation ID、缺失 `--yes`。

建议提交：`feat: define safe removal operations`

### B. 隔离存储与安全写入边界

- 实现 quarantine root、权限、temp+rename、manifest-last。
- 实现 pre/post hash、journal、崩溃状态识别。
- 测试 symlink/junction/special-file、路径逃逸、跨卷复制、预算耗尽。

建议提交：`feat: add recoverable quarantine store`

### C. Skill 多选删除与恢复

- 交互 checkbox 与 itemId 选择进入同一个 planner。
- 完成 Skill 全目录预检、复制、验证、删除、复扫和自动回滚。
- 完成 operation 级 restore。
- 测试多 Skill 全成功、中途失败全回滚、内容变化拒绝、恢复冲突拒绝。

建议提交：`feat: quarantine and restore selected skills`

### D. MCP 格式编辑 spike

- 为 JSON/JSONC、YAML、TOML 各建立注释/格式 fixture。
- 选定 CST/range 实现，验证 Node 22、Windows 和 npm tarball。
- 明确不支持形状及稳定拒绝码。
- spike 未满足“未触及文本字节保持不变”时不得进入自动写入阶段。

建议提交：`test: prove format-preserving MCP edits`

### E. MCP 删除、批处理和回滚

- 按 source 分组多个 MCP edit。
- 对一个配置文件只做一次 backup 和一次 write。
- 实现语义差分验证、复扫验证、失败自动恢复。
- 测试同名多来源、同文件多选、managed 拒绝、未知 source 拒绝、配置变化拒绝。

建议提交：`feat: quarantine and restore selected MCP servers`

### F. 安全、隐私与发布验收

- secret sentinel：终端、JSON、operation list、错误均不泄漏配置值或物理路径。
- no-shell：删除实现不启动 shell 或 agent CLI。
- read-only 回归：doctor 行为和写入 trace 保持零写入。
- tarball 安装后测试 remove dry-run、Skill/MCP fixture 删除、自动回滚和 restore。
- 更新 README、命令帮助、1.1 migration/release notes。

建议提交：`docs: document safe removal lifecycle`

## 9. 必须覆盖的测试矩阵

- Windows/POSIX 路径、大小写与分隔符。
- user/project 可删除；managed/plugin/external/system 拒绝。
- 单个和多个 Skill；目录含资源；目录含链接/特殊文件。
- 同一 MCP 名称存在于多个 agent/scope/source。
- 同一配置文件一次选择多个 MCP。
- JSON/JSONC/YAML/TOML 注释与格式保持。
- 计划后源发生变化、执行中失败、验证失败、自动回滚。
- restore 前 post-image 被修改时拒绝。
- operation manifest 损坏、版本未知、状态中断。
- 非 TTY 无 item、缺 `--yes`、未知 operation ID。
- report、operation 输出和日志不含 secret、绝对路径、备份内容。
- npm tarball 安装后的真实 bin smoke test。

## 10. 1.1 完成定义

- `doctor` 仍然零写入。
- 用户能通过复选框选择多个可删除 Skill/MCP。
- 非交互模式能通过多个 itemId 生成计划。
- `remove <operation-id> --yes` 只执行经过重验证的不可变计划。
- Skill 整目录和支持的 MCP 节点都进入隔离区而非永久丢失。
- 任一失败会自动回滚，不留下半完成配置。
- `restore <operation-id> --yes` 能安全恢复完整操作，并拒绝覆盖后续用户修改。
- managed/system/plugin-owned 来源无法被自动删除。
- JSON/YAML/TOML 未选择内容与注释满足格式保留契约。
- `pnpm check`、安全集成测试和 `pnpm verify-pack` 全部通过。
- README、CLI help、operation schema 和发布说明一致。
- Git 工作树干净，每阶段为独立提交。

## 11. 接手模型执行提示

从 A 开始顺序执行，不要直接写 Skill/MCP 删除逻辑。每个阶段先添加失败测试，再实现，再运行 `pnpm check`。涉及真实用户目录的测试一律使用临时 fixture 和注入 filesystem；不得对当前机器上的真实 Skill 或 MCP 配置运行删除测试。

开始前执行：

```powershell
cd D:\project\agent-hygiene\.worktrees\agent-hygiene-v01
git status --short
git log --oneline -12
pnpm check
pnpm verify-pack
```

若 1.0 尚未完成或工作树不干净，先审计现状，不要 reset、checkout 或覆盖用户改动。
