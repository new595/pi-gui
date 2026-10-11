> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# 其它 Pi 扩展在 GUI 中的验收（2026-09-28）

## 范围与方法

用户 Pi `settings.json` 的 `packages` 字段列出五个扩展：`pi-web-access`、`@juicesharp/rpiv-ask-user-question`、`@juicesharp/rpiv-todo`、`@4fu/pi-pwsh`、`pi-subagents`。本报告覆盖前四个；`pi-subagents` 另行验收。仅提取该字段，没有读取认证文件或用户会话。

用已打包的 `F:\Apps\pi-gui-proxy\versions\1.0.1-proxy.4\pi-gui.exe` 启动一次专用 GUI。`userData`、Pi agent 目录和 workspace 均在本目录 `runs/2026-09-28T05-48-00-608Z/` 内。扩展 fixture 在真实 `register(pi)` 生命周期中调用四个已安装包的工厂；仅包装 `registerTool` 以保存 handler 并继续转发给真实 Pi，`on`、`events`、`appendEntry`、`sendMessage` 等 API 原样运行。四条 `/verify-*` 命令在该 GUI 会话中直接调用真实 `tool.execute`，使用真实 GUI extension context。离线模型仅作创建会话的占位，未提交模型请求。网页测试只访问公开的 `https://example.com`，没有启用账号、cookie 或浏览器凭据。专用 GUI 进程已关闭。

这验证了包加载、GUI 中的工具执行路径及指定功能，不验证模型是否会自动选择这些工具，也不覆盖每个扩展的所有功能。

## 结果

| 扩展 | 已验证的功能 | 结论 | 未覆盖或限制 |
| --- | --- | --- | --- |
| `@4fu/pi-pwsh` 0.10.0 | 实际 `pwsh` handler 执行 `Write-Output GUI_EXT_OK`、`wait:10` | 返回 `status: completed` 和 `GUI_EXT_OK`；已安装 Electron 启动器补丁保持原哈希 | 未测试需要用户输入的 PowerShell 程序、长任务及模型自动调用。扩展的 secret input 按 `user-request.ts:85,121` 仅支持 TUI。 |
| `@juicesharp/rpiv-todo` 2.11.0 | 实际 `todo` handler 创建一项任务并列出 | 创建和列出各返回一项任务，标记文本存在 | `/todos` GUI 命令及会话重启后的持久化未测试。悬浮 TodoOverlay 使用组件型 `setWidget`，GUI host 当前只呈现字符串数组，故该看板预计不可见；这是代码判断，未把它算成运行失败。 |
| `@juicesharp/rpiv-ask-user-question` 2.11.0 | 实际 `ask_user_question` handler，合法单选题 | **失败**：GUI context 上调用 `ctx.ui.custom`，返回 `__PI_GUI_UNSUPPORTED_HOST_UI__`，capability 为 `custom`、classification 为 `terminal-only` | 工具注册成功，但当前 GUI 无法呈现此题。扩展只有 `ctx.mode === 'rpc'` 时才先走 `select/input` fallback；GUI SDK 未向 `bindExtensions` 指定 rpc mode。 |
| `pi-web-access` 0.33.0 | 实际 `fetch_content` handler，`{url:'https://example.com',mode:'raw',proxy:''}` | 成功取得 HTML，包含 `Example Domain`，无错误 | 搜索 provider、curator、账号功能、PDF/视频及模型 answer mode 未测试。 |

四个真实扩展工厂均成功注册目标工具。验收结果在 [evidence.json](<F:\learn\Pi-GUI相关文档\subagents-diagnosis\other-extensions\runs\2026-09-28T05-48-00-608Z\evidence.json>)；各工具的简要结果在同级 `results/`，测试入口是 [acceptance.mts](<F:\learn\Pi-GUI相关文档\subagents-diagnosis\other-extensions\acceptance.mts>) 和 [fixture/index.mjs](<F:\learn\Pi-GUI相关文档\subagents-diagnosis\other-extensions\fixture\index.mjs>)。

## 已确认的 GUI 能力限制

- `ask_user_question` 的 `ask-user-question.ts:338-340,372-395` 在 GUI 中进入 `ctx.ui.custom`。GUI `packages/pi-sdk-driver/src/session-supervisor.ts:1851-1856` 对 custom UI 明确抛不支持错误。该工具在验收中复现了此错误。可考虑仅对这个扩展捕获 GUI 的 typed unsupported 错误并走已有 `runRpcPath`；任何补丁都需验证多选、取消、超时等行为。本次未改包源码。
- `rpiv-todo/todo-overlay.ts:65-67` 提供函数组件给 `setWidget`，GUI `session-supervisor.ts:1830-1841` 仅处理 `undefined` 或字符串数组。Todo 的核心工具已成功运行，看板的图形 UI 仍未得到验证。
- `pi-pwsh/src/user-request.ts:85,121` 拒绝在非 TUI 模式输入 secret；普通 input/select/confirm 则走 GUI 已提供的 dialog primitives。这一交互分支本次未执行。

## 记录边界

第一次验收 `runs/2026-09-28T05-47-10-018Z/` 使用未转发生命周期的 mock Pi，导致 `pwsh` 报运行时不可用；该 mock 结果不代表 GUI 行为。随后修正 fixture，在真实 Pi 上运行扩展工厂和生命周期；以上结论均依据第二次 `05-48-00-608Z` 的结果。没有修改用户安装的四个扩展源码或配置。

## 后续状态更新

用户随后授权修复提问扩展。`rpiv-ask-user-question` 已增加针对 GUI 明确 unsupported 错误的对话框回退，并通过 7 次真实 GUI 交互验收；本报告表格保留修复前的诊断事实。当前使用与回退说明见 [提问扩展修复记录](../ask-repair/README.md)。其余扩展状态不变。
