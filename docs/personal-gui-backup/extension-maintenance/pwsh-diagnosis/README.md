> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# pi-pwsh 0.10.0 / Electron 启动器诊断（2026-09-27）

## 观察

- 当前 `proxy.3` 运行的 `pi-gui.exe` 是 Electron 37.10.3，内含 Node 22.21.1；`process.execPath` 指向该 `pi-gui.exe`。
- 五个原任务的元数据均为 `failed`、`supervisorPid=0`、`failureKind=infrastructure`，`output.log` 只有 `task launcher disconnected during startup`。未读取或记录这些任务的命令内容。
- `@4fu/pi-pwsh` 的 `src/task-runtime.ts` 原版以 `spawn(process.execPath, [task-launcher.mjs, configPath], ...)` 启动任务脚本。Electron 宿主环境没有给该子进程设置 `ELECTRON_RUN_AS_NODE`。
- `pi-gui` 基线已有单实例锁；`proxy.3` 对主进程的改动未修改这条启动路径。此故障是扩展与 Electron 宿主的兼容问题，不能归因于代理或缩放逻辑。

## 已安装的本地补丁

安装位置：`C:\Users\lwj\.pi\agent\npm\node_modules\@4fu\pi-pwsh\src`。

- `task-runtime.ts` 只在 Electron 宿主为启动器子进程设置 `ELECTRON_RUN_AS_NODE=1`，用 `PI_PWSH_ELECTRON_RUN_AS_NODE_ORIGINAL` 记录此前的值。
- `task-launcher.mjs` 在启动实际 PowerShell 前恢复此前的环境值，并删除内部标记。主 `pi-gui.exe` 的环境未修改。
- 补丁文件副本在本目录；原文件在 `backup-0.10.0-20260927`。npm 重新安装或升级 `@4fu/pi-pwsh` 可能覆盖安装位置的补丁。

## 本地验证

`smoke.mjs` 使用已安装的 `pi-gui.exe` 的 Node 模式加载补丁后的真实 `PwshTaskRuntime`，所有任务数据在本目录的 `smoke-data` 中。隐藏窗口、等待进程退出的执行结果为 exit code 0，stderr 为空：

```text
hello: "hello"
fixture: "fixture-ok"
env-unset: "clean"
env-original: "0"
all smoke checks passed
```

前两项分别验证简单输出和读取临时 `fixture.txt`；后两项验证 `ELECTRON_RUN_AS_NODE` 不泄漏到 PowerShell，且调用者原有值可恢复。这是隔离测试；当前已打开的 Pi 窗口必须重启或重新加载扩展，才能加载磁盘上的补丁，尚未在该窗口中重新执行工具。

## 回退

关闭所有使用此扩展的 Pi 进程后，将 `backup-0.10.0-20260927` 内的两个文件复制回上述安装位置，再重新启动 Pi。回退前可先确认安装文件的 SHA-256 与本目录补丁副本一致，避免覆盖后续升级：

| 文件 | 原版 SHA-256 | 本次补丁 SHA-256 |
| --- | --- | --- |
| `task-runtime.ts` | `8817B1B4D6B427D545264A0C29111E1271878749EBDF901C8683D808D1F35431` | `94E93FB851298D200A35EF292DA60131E4123E769C17ADBD595A22B3EAD51FB5` |
| `task-launcher.mjs` | `5680F36F2FF79D60C1BFCFEB556B144DF99727C46490AF933B23751CA5D95115` | `52DDA0A0003E1B6088F542BF87F3F268E0FE61C5E3898D428D06567F18C14FD6` |
