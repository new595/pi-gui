> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# 提问扩展 GUI 兼容补丁（2026-09-28）

## 修改

安装包：`@juicesharp/rpiv-ask-user-question` 2.11.0。
目标文件：`C:\Users\lwj\.pi\agent\npm\node_modules\@juicesharp\rpiv-ask-user-question\ask-user-question.ts`。

GUI 提供 `select`/`input`，但其 `custom` 方法明确抛出终端组件不受支持的错误。补丁仅捕获前缀为 `__PI_GUI_UNSUPPORTED_HOST_UI__:` 且 JSON 中 `capability=custom`、`classification=terminal-only` 的 Error，转入扩展已有 `resolveUndefinedResult` / `runRpcQuestionnaire` 流程。未知错误、其他能力错误及畸形 JSON 均继续抛出。

保留外层 finally 的输入监听清理和 blocked 事件。回退调用使用 `return await`，保证用户完成或取消前不会提前结束 blocked 状态；原有 custom 返回 undefined 的分支也采用相同等待顺序。CLI 正常 custom 流程、GUI 全局 mode、用户模型配置均未改动。

## 行为

- 单选使用 GUI 选项对话框。
- 选择自定义回答后打开文字输入框。
- 多选沿用上游 fallback 的编号输入（例如 `1,3`），不是复选框。
- 多道题依次询问，不呈现终端版的分页/预览布局。
- 取消任一题时返回原有 cancelled/decline 结果，不编造答案。

## 备份与回退

| 文件 | SHA-256 |
| --- | --- |
| 原版 `ask-user-question.before.ts` | `3259729A00BA3FCAB4B626B8525FB5B25C76A9583C1B97D51D0E1C6AEDAD3C26` |
| 补丁 `ask-user-question.patched.ts` / 当前已安装文件 | `8ED9621AF8E97F5779C6DD989B4C3BA30A9A48B1D20DF0B61A915EB427044F34` |

回退前完整退出相关 Pi 进程，确认目标仍是上述补丁哈希及相同包版本，再将 before 副本恢复到目标位置。扩展升级后不要用旧文件覆盖新版。

这是本机扩展补丁，不在 pi-gui 源码提交或 app.asar 内；扩展重装/升级可能覆盖。没有安装新依赖。已核对之前 pi-pwsh 两个补丁及 pi-subagents 显示补丁哈希未变。

## 验证

[boundary-check.mjs](./boundary-check.mjs) 针对实际注册的工具实现注入模拟 UI 边界，检查：目标错误进入回退；五类普通/畸形/非目标错误不被吞掉；正常 custom 成功不调用 fallback；unsupported 和 undefined 两条路径在取消前后 blocked 事件配对；缺少对话框时保留 no_custom_ui 返回。全部通过，结果见 [boundary-results.json](./boundary-results.json)。这不是实际 GUI 验收，真实窗口验证另见 `verification` 目录。

### 实际 GUI 验收结果

已在安装版 `1.0.1-proxy.4` 的独立配置中验证 7 次真实交互：单选 Beta、自定义输入、多选 `1,3` 对应 One/Three、取消返回 cancelled=true 且无答案、连续两次调用分别返回各自选项、两题问卷在第二题取消并只保留第一题 Keep。全部通过。每次 blocked 事件都是 true/false 成对出现，未残留对话框。测试 PID 1960 已退出。

证据：[evidence.json](./verification/runs/2026-09-28T10-52-45-669Z/evidence.json)；[单选界面截图](./verification/runs/2026-09-28T10-52-45-669Z/single-dialog.png)。测试以真实扩展 factory 和真实 GUI context，通过专用测试命令调用工具 handler，不伪造对话框；无真实账号、无模型请求。因此覆盖工具交互本身，不声称验证了模型自动选择工具及后续生成。

使用时先待当前任务完成，完整退出并重启 Pi GUI，让进程重新加载扩展文件。原快捷方式和 proxy.4 程序可继续使用。
