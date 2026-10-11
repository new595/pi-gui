> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Pi GUI 扩展兼容性诊断与验收（2026-09-28）

## 当前结论

- `pi-subagents`：已补齐匹配 GUI 的 0.87.1 SDK 依赖，修复执行器缺包。已加本地 Electron 显示补丁，真实 proxy.4 窗口内 `/subagents-models scout` 的模型映射已显示在可展开的 `Subagent model` 面板。
- `pi-pwsh`：真实 GUI 宿主内执行 `Write-Output GUI_EXT_OK` 成功；此前两个补丁文件保持不变。
- `rpiv-todo`：真实工具 handler 的创建、列表操作成功。终端自定义悬浮看板不受 GUI 支持（源码判断），不等于待办数据操作失败。
- `pi-web-access`：真实工具 handler 的公开页面 raw fetch 成功；搜索、浏览器登录和视频等未验证。
- `rpiv-ask-user-question`：已修复 GUI custom 不支持时的对话框回退；单选、自定义输入、多选编号、取消和连续调用等 7 次真实 GUI 交互通过。

## 阅读入口

- [提问扩展补丁、验收与回退](./ask-repair/README.md)

- [依赖修复、显示补丁与回退](./dependency-repair.md)
- [子代理命令的实际 GUI 验收](./gui-acceptance.md)
- [其他四个扩展的验收报告](./other-extensions/report.md)
- 其他扩展的实际验证证据：`other-extensions/runs/2026-09-28T05-48-00-608Z/evidence.json`。

## 使用

退出正在使用的 Pi GUI 后从 proxy.4 桌面快捷方式重新启动。在 Extensions 中保持 pi-subagents 启用，在已有会话输入 `/subagents-models scout`，展开输入框附近的 `Subagent model` 面板即可查看结果。新建会话草稿尚未建立运行时，可能没有会话扩展命令菜单。

这里只更新本机扩展依赖与一个扩展文件，没有重新打包、改源码或推送 GitHub。扩展更新/重装可能覆盖本地补丁，先核对版本再迁移。无参数 `/subagents-models` 与带参数共用修复分支，但本次未单独做无参数 UI 验收。

## 验收边界与存储

所有测试使用独立 userData、agent 与临时工作区，不读取用户 auth 或已有会话。未发起真实模型调用，因此不声称子代理联网生成完整通过。其他扩展由仅测试用 slash 命令调用真实工具 handler，生命周期事件和 GUI context 正常转发；不覆盖模型自动选择工具的行为。相关测试进程均已关闭。

安装新增依赖目录逻辑大小约 462.6 MiB，另保留安装缓存约 197 MiB、GUI 验收目录约 26 MiB（均为文件大小统计，不是 RAM 或实测磁盘净增量）。备份、缓存及测试证据未自动删除。较早失败 run 保留用于追溯，不作为最终通过证据。

运行验收脚本使用仓库已安装的 jiti CLI 和 Node，而不是重新安装项目依赖；`all-extensions-acceptance.mts` 用于子代理显示，`other-extensions/acceptance.mts` 用于其他扩展工具路径。



## 2026-09-28 后台子代理代理修复（已安装）

原因：GUI 主进程读取了全局 Pi settings.httpProxy，但 pi-subagents 的独立后台 runner 原先仅依赖代理环境变量，因此主会话能联网，后台子代理仍可能直连失败。

已修复 pi-subagents 0.73.1 的 src/runs/background/runner-http-dispatcher.js：优先使用全局 settings.httpProxy，留空时使用 HTTP_PROXY/HTTPS_PROXY，保留 NO_PROXY；无效显式配置报错，不静默直连。未改应用包，仍使用 proxy.4。扩展升级可能覆盖本地补丁。

验收：独立 Node 子进程清空代理环境变量后，HTTP、SSE、global WebSocket 均被本地 CONNECT 代理记录；NO_PROXY 直连通过；不可达显式代理没有直连回退。真实安装版后台执行入口调用 openai-codex/gpt-6-luna，返回 PROXY_OK，result.json success=true、state=complete、exitCode=0，未发现 WebSocket error / fetch failed。未覆盖 GUI 提交到后台的完整启动握手及 Bun 运行时。

请完全退出并重新打开 Pi GUI，再测试一个只返回 OK 的后台 Luna 子代理任务。

证据及备份：subagents-diagnosis/background-proxy-repair；真实请求记录 live-runs/2026-09-28T15-56-17.445Z/result.json。本地扩展补丁未包含于此前 GitHub 源码推送。
