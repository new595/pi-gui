> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Pi GUI 个人维护约定

## 当前目标

- 使用简体中文沟通，先给结论，区分实测、推断和未验证范围。
- 用户仅保留 1.0.1-proxy.4 日常使用；GUI 出问题可以使用 Pi CLI。未经要求，不重建旧 GUI 版本或增设回退安装。
- 2026-10-04 用户决定继续维护现有 GUI，不从头重写或更换框架；保留现有个人分支和功能，CLI 与公共扩展仍按需更新。GUI 维护聚焦必要兼容和安全修复；扩展隔离与运行时升级仍待实施，不能把方向确认当作本次修复或升级授权。
- 当前说明以 PI-GUI-使用与维护.md 为准；开发与验收记录中的旧入口是历史信息。

## 路径与入口

- 安装：F:\Apps\pi-gui-proxy\versions\1.0.1-proxy.4。
- 桌面：C:\Users\lwj\Desktop\Pi GUI.lnk，图标使用安装程序内置图标。
- 启动：F:\Apps\pi-gui-proxy\pi-gui-proxy.cmd。必须保留 PI_APP_USER_DATA_DIR=%LOCALAPPDATA%\pi-gui-proxy-v1，不能无说明地改成直接启动 exe。
- Pi 全局目录：C:\Users\lwj\.pi\agent，与 CLI 共用。认证、配置、会话、已安装扩展不得作为旧版本垃圾清理。
- 源码：F:\GitHub-repository\pi-gui，当前 proxy-support 分支。修改源码时读取该仓库 AGENTS.md 和相关验证约定；先检查 git status，不覆盖用户修改。

## 扩展与维护资料

- pwsh-diagnosis 保存 pi-pwsh 启动兼容补丁及原文件。
- subagents-diagnosis 保存依赖修复、斜杠命令显示、提问 UI 回退、后台代理修复与备份。
- pi-subagents 后台代理补丁位于 src/runs/background/runner-http-dispatcher.js；应优先读取 Pi httpProxy，保留 NO_PROXY，禁止无效显式代理静默直连。
- 扩展升级可能覆盖本地补丁；先核对版本和差异再适配，禁止把旧文件盲目覆盖到新版。
- 保留累计源码补丁、锁文件、必要原文件备份、文字报告。临时测试资料的删除须列出明确范围；不得把用户真实会话当作测试资料。

## 工作流程

- 对授权任务持续推进，改动聚焦，避免无关升级和重构。
- 用户偏好合理分配工作：简单盘点和文档可交 Luna，复杂修复交 Sol，负责人审查关键方案及交付结果。
- 遵守当前会话测试授权和工具权限；需要实际联网验证时使用最小任务、隔离环境，不在证据或 Git 中写入凭据。
- 不主动关闭用户运行中的 GUI；更改启动入口后核对目标、参数、图标和数据目录。
- GitHub 保留现有提交历史与分支；不创建 PR、不强推、不删除远程历史，除非用户另行要求。
- 安装包与用户数据不提交 Git。每次维护更新当前说明与实际完成记录，不把静态检查描述为运行成功。

## 当前清理决策

2026-09-29 用户选择还能复用的文件先保留：不要因旧版本程序已删除，就顺带删除开发依赖、构建缓存、测试截图与运行证据。一次性 npm 下载缓存和列明的隔离测试临时目录已清理；精确范围见两份 cleanup-*-20260929.json 清单。

2026-10-11 清理 `subagents-diagnosis` 下 7 个隔离 Electron 测试 profile 的浏览器/GPU 缓存，42 个目录、26,659,656 字节逻辑文件；测试状态、脚本、报告和证据保留。Percho 卸载后，按用户授权删除诊断目录中的 373,785,941 字节候选 ASAR。`%APPDATA%\@percho\desktop`、`%USERPROFILE%\.percho` 仍保留，前两者可能含用户数据；精确清理记录见 `cleanup-disposable-20261011.json`。


## 补丁维护工具

优先使用 patch-manager/patch-manager.mjs check 做只读检查，操作约定见 patch-manager/README.md。repair默认只预览，写入必须先关闭相关Pi进程并明确 --apply --confirm-closed；保留事务日志和备份。未知版本/内容或损坏副本应重新调查，不绕过哈希检查。不自动安装依赖；使用同一state-dir避免并行修复，勿同时运行npm更新。工具管理5个既有本地补丁，不管理GUI安装包。

