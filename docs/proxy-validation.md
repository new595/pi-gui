# 代理功能验收记录：Windows 个人构建

更新日期：2026-09-25。**代理第一阶段已完成本次功能验收，Windows 目录包可供个人使用。未创建 PR、未推送远程。**

## 使用方式

- 目录：`F:\GitHub-repository\pi-gui\apps\desktop\release\win-unpacked`。
- 启动：双击目录内 `Start pi-gui proxy build.lnk`，或 `Start pi-gui proxy build.cmd`。
- 启动器将应用数据单独放在 `%LOCALAPPDATA%\pi-gui-proxy-build`，沿用现有 Pi CLI 的设置和认证目录。
- 本机已配置的代理为 `http://127.0.0.1:7897`，使用时保持 Clash HTTP 代理运行。更改代理设置后重启应用。
- 用户原有 Pi 设置已包含 Git Bash 路径，无需为本次使用修改个人配置。
- 已按用户要求打开实际应用窗口供使用；这不是测试进程，后续维护不得误关闭。

## 实现范围

全局 Pi `httpProxy` 优先，缺失或空白时使用 HTTP_PROXY / HTTPS_PROXY，NO_PROXY 对两种来源都生效；非法配置不静默回退直连。配置在启动时读取。桌面 provider 的 Node HTTP/SSE/WebSocket 与自定义 provider 模型探测使用同一代理配置。

本阶段没有新增 GUI 代理设置，删除会话和中文化仍延期。外部浏览器、curl/git/npm 子进程，以及使用 Electron net.fetch 的版本检查器不在本模块覆盖范围。

## 验收结果

| 项目                     | 实际结果                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| 最终新增 unit            | 10/10 通过；TLS 用例合并并改为自包含子进程，父进程无需 NODE_EXTRA_CA_CERTS                |
| Electron core            | 8/8 通过，含 Detect models 经实际本地代理及 provider/认证契约回归                         |
| 开发版真实 Codex         | WebSocket 与 SSE fallback 各 1 项通过，合计 2/2                                           |
| Windows 目录包真实 Codex | 相同两项通过，合计 2/2                                                                    |
| 工具调用                 | Git Bash 实际执行成功，检查展开输出及工作区 marker 文件内容，避免把命令输入误当输出       |
| 路由证据                 | chatgpt.com CONNECT 200；WS open/send/message；强制 WS 失败后 HTTP 200 和实际 SSE data 帧 |
| 构建与打包依赖           | 桌面构建、Windows 目录包、打包运行依赖检查通过                                            |
| 直接启动/快捷方式        | 可见窗口、正确 exe 路径及隔离 profile 创建均已验证                                        |
| 静态检查                 | desktop 两个 tsconfig、架构、ESLint 通过；格式检查排除 Windows 符号链接占位 CLAUDE.md     |

完整 unit 曾运行得到 251 通过、14 失败、3 跳过。将失败旧用例放在全新 worker、排除本次新增代理测试后，13 项 Windows 文件/路径行为失败仍可复现，另 1 项性能预算用例单独通过，记录为波动。用户已同意排除与本次代理改动无关的 Windows 既有问题；这些失败及跳过不计为通过。最终 TLS 测试重构后仅复跑受影响新增 unit，不重复已绿的无关测试。

原先 574 个文件格式失败来自 CRLF 检出，已在不改变源码内容的情况下恢复 LF；它不是未解决问题。

## 证据与维护

仓库：`F:\GitHub-repository\pi-gui`，开发分支 `proxy-support`。

上游基线：`97dc3530511310176b171c4d7419127ccd47689c`。核心实现本地提交：`75c8f53`；测试提交：`349bf5d`。

仓库 `.artifacts/proxy` 中保留：

- `self-contained-unit-rerun.log`、`core-proxy-tests.log`。
- `full-unit-tests.log`、`known-failed-tests.log`（保留失败记录）。
- `live-dev-20260925-04`、`live-packaged-20260925-05`：每项含 doctor、截图、trace 和不含认证内容的计数 JSON。
- `verify-runtime-deps-windows.log`、`launch-direct-result.log`、`launch-shortcut-result.log`。
- `static-tsc-ui.log`、`static-tsc-electron.log`、`static-architecture.log`、`final-eslint.log`、`static-prettier.log`。

早期 live 尝试中的路径断言错误、SSE MIME 假设、工具输出断言误判均保留为诊断记录，最终通过结论依据修正后的 dev04 和 packaged05。真实验收采用隔离 profile 与私有认证目录，未把认证内容放入报告或提交。

目录包使用本次命令级 `--config.win.signAndEditExecutable=false` 构建，因为当前账户不能解压签名工具中的符号链接。未改系统权限或 TLS 校验；包未签名，EXE 图标和版本资源可能保持 Electron 默认值。此目录包可运行，不等于已制作或验收安装器。

详细使用及覆盖范围见源码仓库 `docs/proxy-support.md`。
