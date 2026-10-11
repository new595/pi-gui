> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# pi-subagents 依赖修复记录（2026-09-28）

## 诊断

Pi GUI 的 Pi SDK 使用 jiti alias 加载扩展入口，因此 `pi-subagents` 可以注册 `subagent` 工具。该扩展 0.73.1 在首次执行工具时，才从 `src/extension/index.js:631-636` 以原生 `import()` 加载 `src/runs/foreground/subagent-executor.js`。后者通过 `src/shared/fork-context.js:9` 等模块引用 `@earendil-works/pi-coding-agent`。用户扩展安装目录 `C:\Users\lwj\.pi\agent\npm\node_modules\@earendil-works` 当时为空，原生 ESM 从扩展路径解析不到该包，于是工具调用失败。`pi-subagents/package.json:25-45` 将这些 SDK 包标为 optional peer dependencies；GUI 仓库自己的 SDK 安装不处于扩展目录的模块解析路径上。

这说明此前已看到的 `subagent` 工具调用确实进入了扩展，失败发生在执行器加载阶段。`/subagents-models` 是否在 GUI 中正常派发仍需单独做 GUI 验收。

## 安装操作

安装前已将用户 npm 目录的 `package.json`、`package-lock.json`、`pi-subagents/package.json` 及 `pi-pwsh` 两个已打补丁的文件备份到本目录。Pi GUI 仓库 `apps/desktop/package.json:97` 与 `packages/pi-sdk-driver/package.json:27` 使用 `@earendil-works/pi-coding-agent` `^0.87.1`；仓库已安装版本为 0.87.1。为保持版本一致，在 `C:\Users\lwj\.pi\agent\npm` 执行了：

```powershell
npm install --offline=false --cache 'F:\learn\Pi-GUI相关文档\subagents-diagnosis\npm-cache' --ignore-scripts --no-audit --no-fund --save-exact @earendil-works/pi-coding-agent@0.87.1 @earendil-works/pi-agent-core@0.87.1 @earendil-works/pi-ai@0.87.1 @earendil-works/pi-tui@0.87.1
```

`--ignore-scripts` 防止安装包脚本执行。安装未升级 `pi-subagents` 或 `pi-pwsh`。npm 实际输出为 `added 236 packages, and changed 1 package`；现有 `typebox` 从 1.3.16 变为 1.3.27。安装前的 dry run 输出为新增约 93 个包、1 个变更；dry run 与真实安装的计数不同。锁文件实测的包路径从 224 增至 485，新增 261 个路径、无删除。当前证据不能确定 npm 两次计数不同的内部原因，因此以真实安装结果和前后锁文件差异为准。

按安装后锁文件中新增包路径对应的顶层目录递归累计文件大小，逻辑新增约 485,072,993 字节（462.6 MiB）。该数值来自 `C:\Users\lwj\.pi\agent\npm\node_modules` 内的新增依赖目录，排除了本工作区的 npm cache、备份和 staging；它是文件大小总和，不代表磁盘实际分配空间或净增量。

## 离线验证

- 在用户 npm 目录执行 `npm ls --depth=0 --offline --json`，退出码为 0，四个新增 SDK 包均解析为 0.87.1；现有 `pi-subagents` 为 0.73.1、`@4fu/pi-pwsh` 为 0.10.0。
- 原生 ESM 导入用户目录下的 `pi-subagents/src/runs/foreground/subagent-executor.js` 成功，`createSubagentExecutor` 的类型为 `function`。
- 原生 ESM 导入用户目录下 `@earendil-works/pi-coding-agent/dist/index.js` 成功，`SessionManager` 的类型为 `function`。
- 原生 ESM 导入 `pi-subagents/src/slash/slash-commands.js` 成功，`registerSlashCommands` 的类型为 `function`。
- `pi-subagents/package.json` 安装前后 SHA-256 相同。`pi-pwsh` 的 `task-runtime.ts` 安装前后 SHA-256 均为 `94E93FB851298D200A35EF292DA60131E4123E769C17ADBD595A22B3EAD51FB5`；`task-launcher.mjs` 均为 `52DDA0A0003E1B6088F542BF87F3F268E0FE61C5E3898D428D06567F18C14FD6`。

这些验证只覆盖本地依赖解析和现有文件。安装与验证过程没有调用模型。GUI 命令验收另行进行。

## 回退材料

- `package.before.json`、`package-lock.before.json`：安装前清单和锁文件。
- `package.after.json`、`package-lock.after.json`：安装后清单和锁文件。
- `pi-subagents-package.before.json`：扩展包安装前 manifest。
- `task-runtime.before.ts`、`task-launcher.before.mjs`：安装前已打补丁的 `pi-pwsh` 文件。

若要回退，应先关闭使用这些扩展的 Pi 进程，核对当前文件仍与 after 备份一致，再恢复 before 清单并按旧锁文件重建依赖。重建可能覆盖 `pi-pwsh` 的本地补丁；随后须恢复这两个补丁文件。仅删除新增的 SDK 目录会令安装树与锁文件不一致。

## `/subagents-models` 显示兼容补丁

独立打包版 GUI 验收发现：命令注册、执行均成功，隔离会话文件中包含正确模型映射且无模型 token 使用；但扩展使用终端专用结果组件，并把最终 custom_message 标记为 `display:false`，GUI 未呈现结果。

本地 `pi-subagents/src/slash/slash-commands.js` 已追加一个仅对 Electron 宿主且 `action === "models"` 生效的文本 widget 输出。CLI 原有流程、会话持久化和其他命令不变。GUI 中结果位于输入框附近的扩展面板，折叠时需展开 `Subagent model`。实际界面复测结果见 `gui-acceptance.md`。

- 原文件：`slash-commands.before.js`。
- 补丁副本：`slash-commands.patched.js`。
- 安装后 SHA-256：`34A0996A3413E427D0221646E530F3DDD5F4A15B0BA10E1F4F6DB39698136395`。
- 此补丁在用户 npm 安装目录，未修改 pi-gui 源码或打包文件。更新/重装 pi-subagents 可能覆盖它。
- 回退时先核对当前文件仍为上述哈希，退出相关 Pi 进程后恢复原文件，再重新启动。若扩展已升级，不要用旧备份覆盖新版。
