> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Packaged Pi GUI slash-command acceptance

## 结论

已在用户指定的已安装 `pi-gui-proxy.4` 桌面程序上验证 `pi-subagents` 的 `/subagents-models scout`：slash 菜单注册可见，命令执行后出现 `Subagent model` extension dock；展开后能读取模型映射字段。显示补丁有效。

## 方法与边界

- 通过仓库 `tests/helpers/electron-app.ts` 的 `launchDesktopByExecutable` 启动 `F:/Apps/pi-gui-proxy/versions/1.0.1-proxy.4/pi-gui.exe`。
- 每次运行使用此目录 `runs/<timestamp>/` 下单独的 `user-data`、`agent` 与 `workspace`。`agent/settings.json` 仅指定已安装扩展包；离线模型为 `offline-validation/offline`，地址 `127.0.0.1:9`，key 为字面 dummy 值。
- 启动环境没有继承父进程环境；`PI_APP_TEST_MODE`、test lane、real-auth 标记都缺席。doctor 显示 `isPackaged=true`、正确 app.asar/exe 路径、userData与agent隔离，且未加载测试 hook。脚本只关闭它创建的 Electron 进程。
- 使用 UI slash composer 发现并提交 slash 命令。建session通过隔离应用的公开 `piApp` renderer bridge，不复制或读取用户 auth/session；`/subagents-models scout` 本身走 extension 本地处理，不调用模型。结果由 UI dock 读取并截图。

## 实际观察

验收 run `2026-09-28T05-44-01-285Z` 首次显示 collapsed dock。修改验收脚本后复用同一隔离 profile 创建新验收 session，再运行命令并展开 dock，字段为：

- `Agent: scout`
- `Effective model: offline-validation/offline`
- `Source: inherits current session model`
- `Thinking: low`
- `Current session model: offline-validation/offline`

`evidence.json` 中 `outputIsModelsResult=true`、`outcome=models-result-displayed`、`ownedProcessClosed=true`。人工检查 `result.png`，可见扩展 dock 中的完整映射。命令建议列表中出现 `Subagents models`。

本次实际 UI 输入带参数的 `/subagents-models scout`。无参数分支 `/subagents-models` 未另起第二个 app 重复验收；静态检查安装扩展的 handler 可见，无参数和带参数都调用 `runCommand` 的 `action: "models"` 分支，GUI 显示补丁也按 `params.action === "models"` 处理两者。无参数的 GUI 输出仍属未实测。

之前的准备性 run `2026-09-28T05-36-41-193Z` 只停留在 New thread draft，尚无 runtime command，因此未显示 slash menu；没有提交该 slash 文本。实际运行进一步确认 runtime session 建立后命令注册正常。

## 证据

- [成功证据 JSON](./runs/2026-09-28T05-44-01-285Z/evidence.json)
- [成功屏幕截图](./runs/2026-09-28T05-44-01-285Z/result.png)
- [slash 命令菜单截图](./runs/2026-09-28T05-44-01-285Z/slash.png)
- [展开后的 dock 文本](./runs/2026-09-28T05-44-01-285Z/evidence.json)
- [准备阶段首次启动截图](./runs/2026-09-28T05-36-41-193Z/launch.png)

`pnpm exec` 本机状态检查会尝试向只读 repo checkout 写临时文件并触发 `pnpm install`，收到 EPERM。验收改用仓库现有 `jiti` CLI 直接运行脚本；启动目标 exe 需要提升权限，提升后成功。没有改 repo 文件或依赖状态。
