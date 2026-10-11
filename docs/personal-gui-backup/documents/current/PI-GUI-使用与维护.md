> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Pi GUI 个人版使用与维护

更新：2026-10-11。既有 Pi GUI 整理结果仍是仅保留 **1.0.1-proxy.4**，故障时可用 Pi CLI，不保留旧 GUI 回退版本。Percho 0.6.4 试用已结束并卸载；本地 Pi 扩展当前版本与补丁维护工具锁定版本不符，工具已安全拒绝处理。

## 当前维护方向（2026-10-04 已确认）

用户决定继续维护现有 GUI，保留当前个人分支、界面和功能，不从头重写或更换框架；CLI 和公共扩展仍按需更新。GUI 不主动追随官方功能发布，维护聚焦必要的兼容和安全修复。此次方向确认仅更新文档，没有修改程序或配置，也没有实施扩展隔离或运行时升级。

建议继续使用现有个人分支，按需维护运行时、SDK/provider 与 GUI 兼容；GUI 的扩展应另设经过验证的版本和完整依赖副本，避免公共 npm 更新直接覆盖。当前 GUI/CLI 仍共用扩展目录，隔离方案尚未实现。现有 Electron 37.10.3 已结束官方支持，长期维护需要评估升级受支持运行时与实际打包验收，不能把当前安装包永久原样冻结。

此前框架迁移与 Pi RPC 小客户端的比较仅作为评估记录保留，不属于当前实施任务；框架迁移及性能收益均未实现或实测。详见[个人维护与框架选择评估及最终决定](../assessment/GUI-维护路线评估-20261004.md)。

## 启动

桌面入口：**Pi GUI**，图标取自当前 pi-gui.exe 的内置应用图标。

入口调用 `F:\Apps\pi-gui-proxy\pi-gui-proxy.cmd`，启动 `versions\1.0.1-proxy.4\pi-gui.exe`，仅给子进程设置 `PI_APP_USER_DATA_DIR=%LOCALAPPDATA%\pi-gui-proxy-v1`。不要直接双击 exe 替代此入口，以免遗漏数据目录设置。

旧 proxy.3 安装、旧测试版快捷方式、旧多版本选择脚本与 state.json 已删除。原有 CLI 快捷入口未修改。

## 界面缩放

Settings → Appearance → Interface zoom：90%、100%、110%、125%、150%；Ctrl+- / Ctrl+= / Ctrl+0 调节或重置。集成终端获得焦点时按键交给 shell。设置保存在当前应用数据目录的 interface-zoom.json。

## 代理

Pi settings.json 的 httpProxy 优先，留空时使用 HTTP_PROXY/HTTPS_PROXY，保留 NO_PROXY。支持 http/https 代理地址；非法显式设置应报错，不静默直连。修改后完整退出并重启。

Settings → General → Pi and proxy 可查看脱敏状态，Refresh status 只刷新启动快照，不会热更新代理。历史本机地址为 http://127.0.0.1:7897，需要 Clash 相应端口运行。git/npm 等外部程序不属于 GUI 主进程代理的覆盖范围。

2026-10-11：全局 Pi CLI 1.1.0 已内置 HTTP proxy dispatcher，可读取 agent settings 的 `httpProxy`。旧的全局扩展 `http-proxy.ts` 启动时因模块解析失败，且功能已由 CLI 提供，已从自动发现目录移出；原件随后按用户要求删除，没有保留备份。本次只核对安装包代码和本机配置，移除后尚未重新启动 Pi 或发起模型请求。

## Percho 试用与卸载记录（2026-10-10 至 2026-10-11）

Percho 0.6.4 曾安装本地代理补丁并完成 GPT 隔离验证；用户随后反馈不适合并已卸载。2026-10-11 只读检查确认 `F:\AI\percho` 安装目录及开始菜单快捷方式均不存在，因此该补丁不再是当前使用配置，也不需要为 Pi GUI 维护。

此前补丁曾在创建 Pi runtime 前使用安装包已有的 undici 初始化主进程全局 HTTP/WebSocket 代理，优先读取 Pi `httpProxy`，并保留 `NO_PROXY`。隔离窗口 `testProvider` 的 `openai-codex/gpt-6-luna` 曾返回成功；本地模拟覆盖 HTTP/SSE、WebSocket、环境变量回退、非法设置及不可达代理无直连回退。真实认证和会话未修改；完整会话工具流、HTTP/SSE fallback 和所有扩展未验证。完整历史见 [Percho 代理诊断](./percho-proxy-diagnosis/REPORT.md)，仅作已结束试用的记录。

仍存在 `%APPDATA%\@percho\desktop` 和 `%USERPROFILE%\.percho`。本次未检查其内容，也未删除，避免误删用户数据或插件状态。用户已确认删除诊断目录中的完整候选归档 `candidate\app.asar.candidate`（373,785,941 字节）；小型补丁源文件和报告仍保留作历史记录。本次清理范围见 [2026-10-11 临时缓存清理清单](./cleanup-disposable-20261011.json)。

## 本地扩展修复

- pi-pwsh 0.10.0：Electron 下启动子进程的 2 个兼容补丁仍保留。
- pi-subagents 0.75.0（2026-10-04 核对）：4 个 0.87.1 SDK 依赖仍保留；2026-10-01 更新已覆盖模型面板显示和后台 runner 读取 Pi httpProxy 的 2 个本地补丁，尚未重新适配。此次代码检查仍未看到相应本地分支，未重做真实窗口或后台模型验证。GUI 模型结果显示、仅在 Pi 配置设置代理且未设置环境代理的 GUI 后台执行可能受影响；CLI 启动时的代理环境初始化可补偿后一条路径。
- rpiv-ask-user-question 2.12.0：更新已覆盖 GUI select/input 回退补丁。真实工具 handler 的模拟 GUI 边界测试复现回退失效，尚未重新适配；此前 2.11.0 的 GUI 验收属于历史结果。

补丁及原文件分别保存在 pwsh-diagnosis 和 subagents-diagnosis。升级或重装扩展可能覆盖本地修改，不能直接覆盖新版同名文件，应先比较版本与差异。

补丁日常检查与安全恢复入口：[补丁维护工具](../../extension-maintenance/patch-manager/README.md)。工具默认只读检查；仅在精确版本与哈希匹配时恢复，未知变更不覆盖；撤销仅限本工具事务，不自动升级依赖。

当前工具清单仍锁定 pi-subagents 0.73.1 和提问扩展 2.11.0，2026-10-04 检查新版仍返回 3 个版本不匹配并拒绝修复；这是保护措施，不应绕过或直接覆盖旧文件。此前运行检查与补丁失效证据见[2026-10-01 更新检查](../history/extension-update-check-20261001/REPORT.md)，最新版本盘点与评估见[2026-10-04 维护路线评估](../assessment/GUI-维护路线评估-20261004.md)。

2026-09-28 后台代理验证：HTTP/SSE/WebSocket 经本地代理、NO_PROXY 直连、不可达代理无直连回退；真实安装版后台入口调用 GPT-6 Luna 返回 PROXY_OK。未据此证明所有扩展功能或 Bun 运行时正常。

2026-09-30 扩展更新后检查：pi-web-access 已为 0.34.0；5 个本地补丁哈希及 4 个 GUI SDK 依赖版本保持正常。CLI/GUI 对应 SDK 的隔离加载通过，网页工具实际抓取与存储读取通过。联网 npm audit 仍报 1 moderate、2 high，来源为 pi-subagents 使用的 undici 8.10.0 和 GUI SDK 内的 brace-expansion 5.0.9；没有进行依赖修复。npm 的强制修复方案涉及将 pi-subagents 降至 0.65.0，不应直接执行。详见[检查记录与验证边界](../history/extension-update-check-20260930/REPORT.md)。

用户决定暂不修复上述安全依赖，等待兼容的上游更新；保持当前安装，不强制审计修复或降级。安全提示仍存在，功能测试通过不代表漏洞已消失。后续扩展更新需核对本地补丁；SDK 内的依赖问题可能还需兼容的 Pi SDK 更新才能消除。

2026-10-01 检查结果：pi-web-access 0.35.0、pi-subagents 0.74.0、提问/待办扩展 2.12.0、全局 CLI 0.99.2。TypeBox 警告触发条件已移除；联网 npm audit 降为 1 high，仅剩 GUI 对应 SDK 内 brace-expansion 5.0.9。隔离加载与网页抓取通过，但上述 3 个 GUI 兼容补丁已被更新覆盖。此次仅检查，未修改扩展或依赖。

2026-10-04 版本盘点：全局 CLI 已为 1.0.2，pi-subagents 为 0.75.0；实际安装版 GUI 中 Pi SDK 仍为 0.87.1。本次没有重新执行 npm audit、网页抓取、真实窗口或模型调用，不能把 10-01 的审计及运行结果作为今天的新验证。

2026-10-11 只读补丁检查：实际安装扩展为 `@4fu/pi-pwsh` 0.11.0、`pi-subagents` 0.77.0、`@juicesharp/rpiv-ask-user-question` 2.12.0；补丁工具仍锁定 0.10.0、0.73.1、2.11.0，故 5 个补丁均报告 `version_mismatch` / `unsafe` 并停止检查写入。四个 GUI SDK 依赖仍为 0.87.1。不要据此手工覆盖或删除新版扩展文件；需另行基于新版本差异重新评估。

## 数据与源码

- 当前 GUI 数据：%LOCALAPPDATA%\pi-gui-proxy-v1。
- Pi 配置、认证、扩展和会话：C:\Users\lwj\.pi\agent，CLI 也使用此目录；不要作为旧 GUI 文件删除。
- 旧 GUI profile 可能含独有设置或历史，本轮不删除用户数据。
- 源码：F:\GitHub-repository\pi-gui，proxy-support 分支；上次已推送提交 3f6a005。
- GitHub 保留现有提交历史和分支，不新增安装包，不创建 PR，不重写历史。

当前运行程序不依赖源码目录的构建产物。源码、锁文件、个人补丁、扩展备份和文字验收报告属于必要维护资料。详见开发与验收记录；其中旧入口与回退说明是历史记录，以本文为准。

## 文件保留策略（2026-09-29）

按用户最新选择，保留可复用的源码依赖、构建工具缓存、测试脚本、截图和运行记录。仅删除已完成依赖修复的一次性下载缓存与隔离测试临时目录。清单见 cleanup-installed-20260929.json 和 cleanup-disposable-20260929.json；无需保留旧版 GUI 安装。

