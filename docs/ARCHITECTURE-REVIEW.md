# Skill 扫描与项目结构检查

检查日期：2026-09-06。结论：保留现有分层，做局部重构；不需要改成 monorepo 或重写 CLI。

## 本次问题的原因

- 本机 `/opt/homebrew/bin/ahd` 是全局安装的 2.0.2，当前仓库是 2.1.0。修改仓库并不会更新全局命令。仓库原本已经加入 `$CODEX_HOME/skills` 兼容扫描。
- 三个适配器原本都读取了 `SKILL.md`，但丢弃内容，把文件夹名当成技能名，并硬编码 `frontmatter: missing`、`loading: always`。
- Codex 原本遗漏项目 `.agents/skills` 和 `$CODEX_HOME/skills/.system`。
- Skill 读取失败被忽略；`doctor` 只调用 configuration/MCP 分析器，缺少 skill 元数据检查。因此 Findings 为 0 不能证明 skill 正常。
- 本机 `.claude/skills` 确实存在这些 Cloudflare 技能。相同技能分别安装在 Codex、Claude 中，不应仅按名称把两者合并。

## 已完成的局部重构

```text
cli/doctor ───────┐
                 ├─ scan/local ─ adapters ─ shared/skills ─ core/fs + parsers
manage/scan ──────┘       │
                         └─ analyzers ─ report ─ reporters
```

- `src/scan/local.ts`：统一 doctor 和管理命令的真实扫描、分析、报告组装；`manage/scan.ts` 保留兼容导出。
- `src/adapters/shared/skills.ts`：共用有边界的目录读取和 YAML frontmatter 解析；缺失名称时只用文件夹名展示，不伪造 `nameUsable`。
- Codex 新增项目/系统技能，系统技能标记为 managed；解析绝对路径形式的 `skills.config` 启用设置，项目配置优先。
- `src/analyzers/skills.ts`：检查缺失/损坏 frontmatter、空名称、空描述；doctor 和管理扫描共用该检查。
- Skill 的加载方式改为 lazy。正文不会进入 inventory。损坏 YAML、拒绝的路径和扫描限额不再静默消失；可选目录不存在不报警。

## 后续重构优先级

| 优先级 | 位置 | 问题与建议 |
| --- | --- | --- |
| 高 | adapters/*、core/coverage | 用明确的“支持面/未扫描面”计算和解释 coverage。当前有任何结果就返回 partial，读者无法从该字段得知具体遗漏。 |
| 高 | Codex/Claude 插件发现 | 实现安装记录、启用配置、manifest、实际安装版本的关联。缓存存在不能证明插件正在启用；不要递归把所有 cache 内容标为 active。 |
| 高 | scan/local、core/project-root、adapters/*/roots | 当前调用显式把所选目录当 projectRoot，绕过已有仓库根发现。需统一 CWD→仓库根链、各 agent 继承规则和 SourceRef；同步调整删除路径定位，避免扫描和操作指向不同目录。 |
| 中 | core/context、core/orchestrator、core/fs | 当前所有适配器共用一个 SafeFileSystem，其 AdapterBudget 也被共用。应为各适配器隔离预算、共享 I/O semaphore，并测试耗尽预算时不会影响其他适配器。 |
| 中 | analyzers/context、extensions、cross-agent、filesystem | 四个文件目前重复输出 unresolved-artifact，并未实现对应领域规则。先明确规则契约再接入；全部直接启用会产生重复 finding。 |
| 中 | cli/main、cli/doctor | 同步入口仍返回空的 unknown 报告，异步入口才真实扫描。应逐步统一公开入口并调整调用方和测试，避免 API 使用者获得占位报告。 |
| 低 | cli、scan、manage、setup | 版本字符串在多处硬编码，应建立单一版本来源并校验打包产物；大段单行函数可随业务修改展开以便审查。 |

## 仍然存在的发现边界

- 目前覆盖各技能根的直接子目录和 Codex 的显式 `.system` 容器；没有声称支持任意分类目录递归。
- 尚未实现插件技能、Codex 管理员目录 `/etc/codex/skills`、完整父目录继承链、Hermes 外部技能和完整激活规则。
- 跨已准入根边界的符号链接仍被拒绝并报告诊断；没有放宽现有文件访问安全策略。
- Codex 启用设置目前按扫描到的绝对路径匹配，未做符号链接别名和动态路径解析。
- `active` 表示此扫描范围内未发现禁用设置，不是当前会话已经调用该技能的证据；元数据有效性由 facts/findings 表达。
- `partial` 下的零 finding 只表示已扫描且已实现的规则没有发现问题。

Codex 的位置、按需加载和禁用配置依据：[官方技能文档](https://learn.chatgpt.com/docs/build-skills)。本机兼容目录和系统容器另经只读文件检查确认。

## 验证与本地使用

`pnpm check` 通过：lint、类型检查、46 个测试文件中的 219 个测试、构建。新增真实文件系统回归覆盖三个 agent、名称与目录名不同、BOM/CRLF、多行描述、缺失/损坏元数据、禁用技能、项目/系统技能、越界链接以及正文不进入报告。

本机新构建的 Codex 结果为 21 个 inventory，其中 18 个 skill（12 个用户技能、6 个系统技能）；仍为 partial，未包括插件技能。这是当前磁盘快照，不是固定预期数量。

在仓库根目录运行本次构建：

```bash
pnpm build
node dist/cli/main.js doctor
```

本次没有发布 npm 包或替换全局安装，所以直接运行 `ahd` 仍可能使用旧版。
