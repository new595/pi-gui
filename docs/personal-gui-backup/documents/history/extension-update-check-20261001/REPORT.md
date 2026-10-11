> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# 2026-10-01 插件更新检查

## 当前结论

插件更新已生效，原有两个 TypeBox 依赖声明警告的触发条件已移除；联网 npm audit 从 3 个受影响包条目降为 1 个 high。5 个扩展在 CLI/GUI 对应 SDK 加载器中均成功注册，网页抓取及存储内容读取通过。

本次更新也覆盖了 3 个 GUI 兼容补丁。已在真实提问工具 handler 的模拟 GUI 边界中复现回退失效；模型面板显示与后台代理两项以代码检查判断，需要按新版重新适配。不能把扩展能注册解释为 GUI 全部功能正常。

本次仅检查、保存隔离验证资料和更新维护文档，没有修改插件、依赖、补丁清单、GUI 安装或用户配置，没有关闭用户 GUI，没有调用模型或写入真实用户会话。仍遵循用户暂不修复安全依赖、等待兼容上游更新的决定。

## 安装版本

| 项目 | 上次记录 | 当前版本 |
| --- | --- | --- |
| pi-web-access | 0.34.0 | 0.35.0 |
| pi-subagents | 0.73.1 | 0.74.0 |
| rpiv-ask-user-question | 2.11.0 | 2.12.0 |
| rpiv-todo | 2.11.0 | 2.12.0 |
| pi-pwsh | 0.10.0 | 0.10.0 |
| 全局 Pi CLI | 0.99.1 | 0.99.2 |
| 4 个 GUI 兼容 SDK 依赖 | 0.87.1 | 0.87.1 |

包版本和依赖声明见 installed-packages.json；测试加载器版本见 cli-sdk-result.json、gui-sdk-result.json。

## 依赖与安全审计

rpiv-ask-user-question 和 rpiv-todo 的 2.12.0 已把 typebox 放入 peerDependencies，范围为 `*`，不再作为 dependencies。本次检查的 5 个扩展均没有把 Pi 宿主提供的包列入普通 dependencies。

pi-subagents 的 undici 已从 8.10.0 升到 8.10.2，之前的 undici 和其导致的 pi-subagents 审计条目消失。pi-web-access 使用其独立的 undici 8.11.2。

audit-online.json 使用 `--offline=false`、npm 官方 registry、独立缓存，审计退出码 1，结果 0 moderate、1 high。剩余节点为 `node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion` 5.0.9，属于仍固定在 0.87.1 的 GUI 兼容 SDK 依赖。更新全局 CLI 到 0.99.2 没有替换该 SDK。

没有执行 npm audit fix 或强制修复。安全问题仍存在，没有验证触发条件或做漏洞利用测试。

## 补丁现状及影响

patch-check.json 中 pi-pwsh 的 2 个补丁仍为 patched，4 个 SDK 依赖仍为 ok。另外 3 个条目显示 unsafe/version_mismatch，是因为维护工具只认可旧版本，属于拒绝未知版本写入的保护，不等于运行时失败或恶意包。

file-comparison.json 保留原件、补丁副本与当前文件的 SHA-256：

| 补丁 | 当前文件情况 | 影响与证据 |
| --- | --- | --- |
| 提问 GUI 回退 | 2.12.0 的 ask-user-question.ts 与 2.11.0 保存的未修改原件完全一致 | 模拟 GUI 的 typed unsupported custom 错误时，真实 handler 直接抛错，没有调用 select；回退失效已在边界测试复现 |
| subagents 模型面板显示 | 0.74.0 的 slash-commands.js 有上游变化，原本针对 Electron 的 models widget 分支缺失 | GUI 的 /subagents-models 结果展示可能退回此前不显示的状态；属于代码检查判断，未做真实窗口点击 |
| subagents 后台代理 | 0.74.0 的 runner-http-dispatcher.js 与保存的未修改原件完全一致 | 本地读取 Pi settings.httpProxy、无效显式代理拒绝静默直连的补丁缺失；仅有 Pi 配置代理时不能依靠该 helper 传给后台 dispatcher；环境代理路径仍存在，未做后台模型请求验证 |

没有将旧补丁文件直接覆盖到新版，也没有绕过哈希或版本检查。后续若修复，应重新核对上游差异、保留新版原件，更新补丁与工具版本清单后再按关闭进程的约定写入。

### 子代理独立复核与限定条件

经用户授权，子代理只读复核上述 3 项，结论一致：

- GUI `F:\GitHub-repository\pi-gui\packages\pi-sdk-driver\src\session-supervisor.ts:1572` 的扩展绑定没有传 mode；0.87.1 SDK 默认 print。该文件第 1855 行的 GUI custom 方法抛出 typed unsupported 错误，与本次边界测试的 mode=print 和错误形式吻合。上游原版虽有 rpc 模式、custom 返回 undefined 的 fallback，但这两条路径不会补偿该 GUI 抛错分支。该结论是宿主代码与真实 handler 测试的组合证据，仍未重做窗口交互。
- 新版 slash-commands.js 的 models 成功分支没有本地 Electron setWidget 补丁；CLI 终端自定义渲染仍存在。因此模型面板问题限于 GUI 的结果展示，不能据此说模型映射或整个 subagent 工具失效。
- 新版 pi-subagents 的 src 中没有找到 httpProxy 读取。Pi CLI 的初始化会把 settings.httpProxy 写入 HTTP_PROXY/HTTPS_PROXY，后台 runner 可能通过继承环境继续工作；GUI 的 `F:\GitHub-repository\pi-gui\apps\desktop\electron\network\desktop-proxy.ts:213` 只给本进程安装 dispatcher，启动 cmd 也没有设置代理环境。故后台代理回退主要影响仅在 Pi settings 设置代理、没有相应环境代理的 GUI detached runner。已有外部环境代理时仍可能正常。没有追加后台模型联网任务。

## 验证范围

- CLI SDK 0.99.2 和 GUI 对应 SDK 0.87.1 均通过实际安装文件的加载与工具/命令注册。
- 更新后的网页工具 handler 实际以 raw 模式经已有代理抓取 example.com，successful=1，随后成功读取存储内容。
- 提问工具运行模拟 GUI 边界，复现已知不支持终端 custom UI 的错误未被回退处理。
- 未验证真实 GUI 点击、CLI 终端交互、各搜索提供商、后台模型执行、视频/PDF 等所有功能。

gui-sdk-result.json 的 passed=true 表示检查脚本成功完成预定断言，其中包含预期复现兼容回退失效；它不表示 GUI 提问兼容性正常。guiQuestionFallback 明确记录 fallbackInvoked=false、errorPropagated=true。

## 上游使用变化

pi-subagents 0.74.0 移除了 workflowScript 和 workflowScriptPath 参数，改用 workflow 字段。使用旧参数的自定义工作流需要调整；本次未遍历用户会话或自定义工作流。

[0.74.0 上游更新日志](https://raw.githubusercontent.com/nicobailon/pi-subagents/v0.74.0/CHANGELOG.md)说明了该参数变更，并建议更新后 `/reload` 或重新启动 Pi，避免进程混用磁盘新旧代码。
