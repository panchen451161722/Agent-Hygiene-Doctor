# Agent Hygiene Doctor：`ahd` CLI、GitHub 与 pnpm 发布计划

> 日期：2026-07-13
> 工作目录：`D:\project\agent-hygiene\.worktrees\agent-hygiene-v01`
> 当前分支：`codex/agent-hygiene-v01`
> 当前版本：`1.2.0`
> 目标版本：`2.0.0`
> 目标仓库：`git@github.com:panchen451161722/Agent-Hygiene-Doctor.git`
> npm 包名：`agent-hygiene-cli`
> 安装后的唯一命令：`ahd`
> 执行状态：进行中；已获得执行、push、tag 与 pnpm 发布授权。

## 1. 目标与已确定边界

本次发布把用户可执行命令从：

```text
agent-hygiene
```

改为：

```text
ahd
```

发布后的典型命令为：

```powershell
ahd doctor
ahd doctor --format json
ahd remove --codex
ahd operations
ahd restore <operation-id> --yes
```

确定采用以下策略：

- npm 包名继续使用 `agent-hygiene-cli`，只修改 `package.json.bin` 的键。
- packed package 只暴露一个 bin：`ahd`；不同时保留 `agent-hygiene` 别名。
- 因为删除旧命令会破坏现有脚本和全局调用，版本升级到 `2.0.0`。
- 产品名称、报告中的 tool name、Skill 安装目录、隔离区目录和 operation 格式继续使用 `agent-hygiene` / `agent-hygiene-cli`，避免无必要的数据迁移和恢复兼容风险。
- GitHub 仓库使用 SSH 地址设置为 `origin`；package 元数据同时使用对应的公开 HTTPS repository/bugs/homepage URL。
- 先完成本地验证和 release commit，再 push/tag/publish；发布动作必须由执行者再次获得明确授权。

## 2. 不应随 CLI 改名的内部标识

以下内容不是 shell 命令，不要机械替换：

- npm package name：`agent-hygiene-cli`。
- JSON report tool name：`agent-hygiene-cli`。
- setup ownership manifest 的 owner/packageName。
- Skill 安装目录：`.agents/skills/agent-hygiene`、`.claude/skills/agent-hygiene`、Hermes 对应目录。
- Windows 隔离区：`%LOCALAPPDATA%\agent-hygiene\quarantine`。
- POSIX 隔离区：`~/.agent-hygiene/quarantine`。
- operation manifest、hash domain、temporary-file prefix 与 schema 字段。
- 历史计划和旧版迁移文档中的命令示例；它们是历史记录，不做全库盲替换。

只有面向 2.0 用户的可执行命令、当前帮助、launcher、release 测试和当前文档改为 `ahd`。

## 3. Task A：定义 2.0 CLI 契约

先添加失败测试，再改实现。

修改范围：

- `package.json`
- `src/cli/main.ts`
- `src/cli/options.ts`
- `src/cli/manage.ts`
- `test/unit/cli/main.test.ts`
- `test/unit/cli/options.test.ts`
- `test/unit/cli/manage*.test.ts`

要求：

1. `package.json.bin` 精确为：

   ```json
   {
     "ahd": "./dist/cli/main.js"
   }
   ```

2. `ahd --version` 输出 `2.0.0`。
3. 所有 usage/help、错误后的提示、remove/restore 的后续命令改为 `ahd`。
4. Commander program name 与 parse argv 占位名称改为 `ahd`。
5. 源码和测试中不再把 `agent-hygiene` 当作当前可执行命令。
6. `agent-hygiene` 不作为 bin 安装；测试必须验证安装目录中没有旧 bin。
7. CLI 行为、退出码、JSON schema 与删除/恢复事务语义不得因改名改变。

建议提交：

```text
feat!: rename CLI executable to ahd
```

## 4. Task B：更新 launcher 与 setup 生命周期

修改：

- `src/setup/launcher.ts`
- `src/cli/setup.ts`
- setup 单元/集成测试

launcher 继续通过 package name 下载，但执行明确的 `ahd` bin。推荐命令：

```powershell
pnpm dlx --package agent-hygiene-cli@2.0.0 ahd doctor --agent-mode
```

如果保留 npx，必须在打包测试中证明其在单 bin 包上执行的是 `ahd`，且文档写明 package-manager 解析可能访问网络。

升级已有 launcher 时：

```powershell
ahd setup --yes
```

必须覆盖：

- 新安装内容只引用 `ahd`。
- 旧的、由本工具拥有且未修改的 1.x launcher 可安全升级。
- 非本工具拥有或被用户修改的 Skill 仍拒绝覆盖。
- setup ownership/path 名称保持兼容，不迁移用户目录。

建议提交：

```text
feat: update launcher to invoke ahd
```

## 5. Task C：升级版本与 package 元数据

将运行时与 package version 统一为 `2.0.0`，至少检查：

- `package.json`
- `src/cli/doctor.ts`
- `src/cli/options.ts`
- `src/cli/setup.ts`
- `src/manage/planner.ts`
- `src/manage/scan.ts`
- `src/setup/launcher.ts`
- 相关测试 fixture/expectation

在 `package.json` 补充：

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/panchen451161722/Agent-Hygiene-Doctor.git"
  },
  "bugs": {
    "url": "https://github.com/panchen451161722/Agent-Hygiene-Doctor/issues"
  },
  "homepage": "https://github.com/panchen451161722/Agent-Hygiene-Doctor#readme",
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

注意：`pnpm publish --provenance` 通常应由受支持的 CI/OIDC 环境执行。若在本机发布，先确认当前 npm/pnpm 版本和 registry 支持；不满足时不要静默关闭 provenance，应改为受保护的 GitHub Actions trusted publishing。

建议提交：

```text
chore: prepare package metadata for 2.0 release
```

## 6. Task D：更新 packed artifact 验收

修改 `scripts/verify-pack.mjs`，使其验证真实发布物，而不是源码入口。

验收必须包括：

1. `pnpm pack --json` 成功并解析出唯一 tarball。
2. tarball 的 `package.json` 版本为 `2.0.0`。
3. `bin` 精确只有 `ahd`，路径为 `dist/cli/main.js`。
4. 安装 tarball 后，Windows 存在 `.bin/ahd.cmd`，POSIX 存在 `.bin/ahd`。
5. `.bin/agent-hygiene*` 不存在。
6. 执行 installed `ahd --version` 得到 `2.0.0`。
7. 执行 installed `ahd doctor --agent-mode` 输出 schema-valid JSON。
8. 使用临时 HOME/CODEX_HOME fixture 验证 `ahd remove` 与 `ahd restore`，不触碰真实配置。
9. tarball 中没有测试、临时文件、operation/quarantine 数据或凭据。
10. 验证结束只删除脚本自己创建的临时目录和 tarball。

建议提交：

```text
test: verify packed ahd executable
```

## 7. Task E：更新用户文档与迁移说明

更新：

- `README.md`
- `CHANGELOG.md`
- 新增 `docs/MIGRATION-2.0.md`
- 当前 CLI 设计规格的 2.0 修订段落（不要篡改历史完成记录）

README 至少包含：

```powershell
pnpm add -g agent-hygiene-cli
ahd doctor
ahd remove --codex
```

迁移说明必须明确：

- `agent-hygiene` 命令已被 `ahd` 替代。
- npm package name 仍为 `agent-hygiene-cli`。
- 旧 operation ID、隔离数据和 restore 语义保持兼容。
- 全局升级后可用 `Get-Command ahd`、`ahd --version` 验证 PATH。
- 如系统残留旧 shim，先定位其来源，不直接删除未知文件。
- 自动化脚本、CI、文档和 launcher 需要把命令改为 `ahd`。

建议提交：

```text
docs: document ahd 2.0 migration
```

## 8. Task F：配置 GitHub 仓库

当前 worktree 没有 remote。发布前确认 SSH 身份和目标仓库确实属于预期账号：

```powershell
ssh -T git@github.com
git ls-remote git@github.com:panchen451161722/Agent-Hygiene-Doctor.git
```

若仓库可访问且没有冲突历史：

```powershell
git remote add origin git@github.com:panchen451161722/Agent-Hygiene-Doctor.git
git remote -v
```

如果执行时已经存在 `origin`，先核对，不得盲目覆盖：

```powershell
git remote get-url origin
```

push 前检查：

```powershell
git status --short
git log --oneline --decorate -10
git fetch origin
git ls-remote --heads origin
```

目标仓库若已有非本项目历史，停止并请求用户决定 merge/import 策略；不得 force-push。

## 9. Task G：发布前门禁

按顺序执行，任一步失败都停止发布：

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm verify-pack
pnpm pack --json
pnpm whoami
pnpm config get registry
pnpm view agent-hygiene-cli versions --json
pnpm publish --dry-run
```

人工核对：

- registry 必须是预期的 npm registry。
- 登录账号有发布 `agent-hygiene-cli` 的权限。
- registry 中不存在 `2.0.0`。
- package name 没有被无关主体占用；若已存在，确认当前账号确实是 maintainer。
- `npm pack --dry-run`/`pnpm publish --dry-run` 文件清单无秘密和开发垃圾。
- Git 工作树干净，所有 release 变更已提交。
- 当前 commit 就是准备发布的 commit。
- `ahd` packed-bin smoke test通过。

## 10. Task H：push、tag 与 pnpm 发布

以下都是外部不可轻易撤销的动作，执行前必须再次取得明确授权。

推荐顺序：

1. 将 release branch push 到 GitHub。
2. 通过 PR 或用户确认合入默认分支。
3. 在默认分支的精确 release commit 创建 annotated tag：

   ```powershell
   git tag -a v2.0.0 -m "Agent Hygiene Doctor 2.0.0"
   ```

4. push 默认分支与 tag：

   ```powershell
   git push origin <default-branch>
   git push origin v2.0.0
   ```

5. 使用 pnpm 发布公开包：

   ```powershell
   pnpm publish --access public
   ```

   若 provenance 已在受支持的 CI 中配置，则使用：

   ```powershell
   pnpm publish --access public --provenance
   ```

不要使用 `--no-git-checks` 绕过发布门禁。不要在 tag、GitHub commit 与 npm package 内容不一致时发布。

## 11. Task I：发布后验证

等待 registry 可见后，从一个全新临时目录验证：

```powershell
pnpm view agent-hygiene-cli@2.0.0 version dist-tags bin repository --json
pnpm dlx --package agent-hygiene-cli@2.0.0 ahd --version
pnpm dlx --package agent-hygiene-cli@2.0.0 ahd doctor --agent-mode
```

验证结果：

- registry 版本为 `2.0.0`。
- `latest` 指向 `2.0.0`（除非明确采用其他 dist-tag）。
- bin 只有 `ahd`。
- repository 指向 `panchen451161722/Agent-Hygiene-Doctor`。
- JSON report 通过 schema 校验。
- README 安装命令可复制执行。

然后创建 GitHub Release，内容来自 `CHANGELOG.md`，不要包含凭据或本机路径。

如果发布后 smoke test 失败：不要覆盖同一 npm version；修复后发布新的 patch（例如 `2.0.1`），必要时将有问题的版本 deprecate。

## 12. 完成定义

- `package.json.bin` 唯一键为 `ahd`。
- 所有当前用户命令、help、launcher 与恢复提示使用 `ahd`。
- 内部持久化路径、operation/quarantine 与 report tool name 保持向后兼容。
- `package.json` 包含正确的 GitHub repository、bugs、homepage 元数据。
- `origin` 精确为 `git@github.com:panchen451161722/Agent-Hygiene-Doctor.git`。
- 版本为 `2.0.0`，CHANGELOG 与 migration 完整。
- `pnpm check`、`pnpm verify-pack`、publish dry-run 全部通过。
- GitHub 上的 release commit/tag 与 npm tarball 内容一致。
- `pnpm view` 和全新环境中的 `ahd` smoke test通过。
- 未泄露 token、绝对用户路径、Skill/MCP 配置值或 quarantine 内容。

## 13. 给接手模型的执行提示

在 `D:\project\agent-hygiene\.worktrees\agent-hygiene-v01` 工作，严格按 Task A 到 I 顺序执行。CLI 改名只针对 shell executable；不要全局替换内部 `agent-hygiene` 标识。先写失败测试，再实现，每阶段提交。任何 push、tag、GitHub Release 或 `pnpm publish` 前都必须重新获得用户明确授权；发布测试只能使用临时 HOME/CODEX_HOME fixture，不能扫描或修改真实 Agent 配置。
