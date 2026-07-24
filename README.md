# Agent Hygiene Doctor

Agent Hygiene Doctor 是一个本地 AI Agent 配置检查与清理工具，安装后的命令是 `ahd`。

它可以扫描 Codex、Claude Code 和 Hermes 的 Skills、MCP、指令与配置文件，帮助你发现重复、失效或不安全的配置。扫描在本地完成，`doctor` 命令只读，不会修改文件。

## 安装

需要 Node.js 22 或更高版本。

使用 pnpm：

```bash
pnpm add -g agent-hygiene-cli
```

也可以使用 npm：

```bash
npm install -g agent-hygiene-cli
```

验证安装：

```bash
ahd --version
```

## 开始使用

检查所有支持的 Agent：

```bash
ahd doctor
```

只检查 Codex：

```bash
ahd doctor --agent codex
```

输出 JSON：

```bash
ahd doctor --format json
```

## 安全删除与恢复

按 Agent 交互式清理 Skill 和 MCP：

```bash
ahd remove --agent codex
ahd remove --agent claude
ahd remove --agent hermes
```

Codex 用户 Skill 会从 `$CODEX_HOME/skills`（默认 `~/.codex/skills`）中发现。选择列表会显示候选总数，并根据终端高度分页。

使用空格勾选，按回车确认；按 Esc 退出且不创建删除计划。被删除的内容会移入本地隔离目录，可以恢复。

查看删除记录：

```bash
ahd operations
```

恢复某次操作：

```bash
ahd restore <operation-id> --yes
```

建议先预览，不修改文件：

```bash
ahd remove --agent codex --dry-run
```

## 更多信息

- [版本记录](CHANGELOG.md)
- [2.0 升级说明](docs/MIGRATION-2.0.md)
- [GitHub 项目](https://github.com/panchen451161722/Agent-Hygiene-Doctor)

## License

MIT
