> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Pi 扩展补丁检查与安全恢复

此工具只管理 5 个已记录的本地文件补丁。默认 `check` 只读，可双击 `检查补丁.cmd`。脚本零依赖，不联网、不安装包、不访问认证和会话内容。默认检查目录为 `C:\Users\lwj\.pi\agent\npm`。

2026-10-01 状态：pi-subagents 已更新至 0.74.0，rpiv-ask-user-question 已更新至 2.12.0，相关 3 个 GUI 补丁已被更新覆盖。清单尚未适配新版，check 会返回 version_mismatch，repair 会拒绝写入。不要绕过版本/哈希检查或把旧文件直接覆盖到新版。pi-pwsh 的 2 个补丁仍匹配。详见[本次检查记录](../../documents/history/extension-update-check-20261001/REPORT.md)。

## 使用

在 PowerShell 中进入本目录，使用 `F:\software\Node.js\node.exe`：

```powershell
& 'F:\software\Node.js\node.exe' .\patch-manager.mjs check
& 'F:\software\Node.js\node.exe' .\patch-manager.mjs check --json
& 'F:\software\Node.js\node.exe' .\patch-manager.mjs repair
```

`repair` 默认只预览 `wouldRepair`。确认包版本、补丁状态和待修复文件后，先退出所有正在使用这些扩展的 Pi GUI 和 Pi CLI 进程，再执行：

```powershell
& 'F:\software\Node.js\node.exe' .\patch-manager.mjs repair --apply --confirm-closed
```

写入后会返回 `transaction` ID。事务记录和逐文件原件备份默认保存在本目录 `transactions\<ID>`。撤销只处理该事务实际改动的文件；先预览，再显式执行：

```powershell
$transaction = '将 repair 输出的事务 ID 粘贴到这里'
& 'F:\software\Node.js\node.exe' .\patch-manager.mjs undo --transaction $transaction
& 'F:\software\Node.js\node.exe' .\patch-manager.mjs undo --transaction $transaction --apply --confirm-closed
```

隔离验证可使用 `--root <npm根目录>` 与 `--state-dir <事务目录>`。撤销时必须使用创建事务时相同的两个目录。`--json` 可加在任一命令后。`--confirm-closed` 表示操作者已关闭相关进程；工具不会自动识别或结束进程。

## 判定与保护

清单锁定包名、精确版本、目标路径、原件与补丁副本的 SHA-256。目标已是补丁时跳过；目标完全等于已知原件才可修复。任一包版本、目标内容、文件类型或补丁副本异常，整批预检失败，修复不会开始。修复不自动升级、降级或安装任何依赖。包路径、目标路径、备份和事务路径遇到符号链接或 junction 时拒绝操作。

四个 `@earendil-works` SDK 依赖仅检查是否为 `0.87.1`，结果见 `sdkDependencies`；缺失或版本不同会使检查退出码为 2，但修复不会安装它们。

修复会在每个目标写入前重新核对包版本、目标哈希和补丁副本哈希，并先保存经哈希验证的原件备份。写入采用同目录临时文件加重命名；每次变更和撤销均写入事务日志。跨多个目标无法保证原子性：中途失败的事务标记为 `partial` 或 `partial_undo`，保留日志与备份，可按显示的 ID 执行 `undo`。撤销前会整批检查包版本、当前目标哈希与备份哈希；若文件后来被修改，拒绝覆盖。事务日志损坏时需人工审查备份，不要手动覆盖未知文件。

| 退出码 | 含义 |
| --- | --- |
| 0 | 补丁均已存在且 SDK 检查正常；或 undo 成功 |
| 1 | 命令或参数错误 |
| 2 | 可修复的原版文件，或 SDK 依赖缺失、版本不同；需查看结果 |
| 3 | 未知内容、版本、路径、补丁副本或备份异常；未开始本次写入 |
| 4 | 本次写入中途失败；需查看事务记录和目标状态 |

### 管理范围

| 包和版本 | 文件 | 目的 |
| --- | --- | --- |
| `@4fu/pi-pwsh` 0.10.0 | `src/task-runtime.ts`、`src/task-launcher.mjs` | Electron 子进程启动兼容 |
| `pi-subagents` 0.73.1 | `src/slash/slash-commands.js` | GUI 模型面板显示 |
| `pi-subagents` 0.73.1 | `src/runs/background/runner-http-dispatcher.js` | 后台 runner 代理配置 |
| `@juicesharp/rpiv-ask-user-question` 2.11.0 | `ask-user-question.ts` | GUI 提问回退 |

补丁副本仍保存在 `pwsh-diagnosis` 与 `subagents-diagnosis`，来源和原始验证见对应记录。扩展升级后须先重新核对版本与差异；本工具会拒绝把旧版补丁复制进未知版本。

## 验收与边界

[验收报告](./verification/REPORT.md)：15 类隔离文件场景通过，真实安装只读检查为 5 个补丁已安装、4 个 SDK 正常。本工具的锁只保护相同 state-dir 的工具实例；不要同时运行 npm 更新或另一个不同 state-dir 的修复。文件检查正常不代表所有 GUI 功能已运行验证。

