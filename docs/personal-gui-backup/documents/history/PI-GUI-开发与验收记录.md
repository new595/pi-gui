> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Pi GUI 个人版开发与验收记录

更新：2026-10-11。本文件记录已完成的阶段、可追溯提交与证据、失败后的纠正及当前未验证范围。日常入口和回退方法见 [使用与维护](../current/PI-GUI-使用与维护.md)。各阶段的结果只适用于当时的源码、安装包和测试条件，不把旧版真实对话算作新版通过。历史段落中的“默认仍为 proxy.1”表示当时的状态；清理后当前默认已改为 proxy.3。

## 版本脉络

| 阶段 | 源码与安装 | 实际结果和边界 |
| --- | --- | --- |
| 2026-09-24 准备 | 上游旧基线 `97dc353`；后来建立 `proxy-support` | 核对仓库、Pi 配置、Windows 环境与代理故障；准备记录是当时的调查快照，随后开工并完成开发 |
| 第一阶段 proxy.1，2026-09-25 | `75c8f53` 功能、`349bf5d` 测试、`458f5be` 文档；旧基线 `97dc353` | 完成代理核心、受控路径和真实 Codex WebSocket/SSE 验收；Windows 目录包可运行，未签名 |
| 第二阶段 proxy.2，2026-09-26 | `c54cf6a` 状态与错误、`8d1d7b1` 固定启动和回退；安装 `0.1.0-beta.40-proxy.2` | 本地与打包界面检查通过；本版真实账户对话被自动审批拦截，未执行；默认入口未切换 |
| 缩放 proxy.3，2026-09-27 | `6c925f7` 实现、`bed5634` 文档；安装 `0.1.0-beta.40-proxy.3` | 缩放核心、实际窗口布局和打包界面通过；真实 provider 未运行；默认入口未切换 |
| 上游 v1.0.1 / proxy.4，2026-09-28 | 上游标签 `v1.0.1` 为 `dd5708f`；整合 `70b8e3b`，修复 `174105f`、`c4317cf`；安装 `1.0.1-proxy.4` | 15 unit、25 dev UI、2 packaged UI 通过；没有全套或真实 provider 对话；默认仍为 proxy.1 |

本地源码目录 `F:\GitHub-repository\pi-gui`，当前分支 `proxy-support`，记录时 HEAD `3f6a005b65be454f65fdf64e500527368b2a65c7`，工作区干净。`origin` 为 `new595/pi-gui`，`upstream` 为 `minghinmatthewlam/pi-gui`；2026-09-28 已推送 `proxy-support`，远程 HEAD 与本地一致；没有 PR，远程 main 保持 `97dc353`。proxy.4 产品源码提交是 `c4317cf`；其后的 `dd85a44` 和 `3f6a005` 只更新测试及文档，没有改变应用构建。

2026-09-28 经授权清理了 proxy.1/2 的安装目录和源码仓库中的 5 个 release 构建副本，保留 proxy.3、proxy.4 两个版本；两版安装程序合计约 993.4 MiB（约 0.97 GiB，逻辑文件大小），release 构建副本为 0。`node_modules` 和 `.artifacts` 保留。`state.json` 从 `current=proxy.1` 改为 `current=proxy.3`，`previous` 仍为空。精确 ID、路径和前后值见 [版本清理记录](./proxy-patches-v1.0.1/cleanup-20260928.json)；旧状态备份在 `proxy-patches-v1.0.1/state-before-cleanup.json`，不能用它恢复已删除的 proxy.1 程序。当前维护策略为保留新版 proxy.4 和回退版 proxy.3。固定启动器的 `Launch` 仍强制使用旧 profile，因此 proxy.4 只应从设置独立 profile 的测试快捷方式启动。

## 原始调查与范围决定

2026-10-11 CLI 扩展整理：全局安装的 `@earendil-works/pi-coding-agent` 为 1.1.0，包内 `cli/setup.js` 调用 `configureHttpDispatcher()`，主流程在加载全局 settings 后调用 `applyHttpProxySettings()`；settings 文档说明 `httpProxy` 应用于 Pi 管理的 HTTP 客户端。`C:\Users\lwj\.pi\agent\extensions\http-proxy.ts` 另行尝试动态解析同一包，启动时因解析失败而未能安装 dispatcher，属于冗余且当前失效的扩展。已将它移出扩展发现目录，原件随后按用户要求删除，不留恢复副本。静态检查确认扩展及备份路径均不存在；移除后的 Pi 启动及真实模型网络路径未验证。

原始 Windows 故障：Clash Verge/Mihomo 在 `127.0.0.1:7897` 监听，Pi agent `settings.json` 设 `httpProxy`；关闭 TUN 后，旧桌面程序的 Codex WebSocket 曾报 `non-101`，SSE fallback 报 `fetch failed`。当时 Pi CLI 启动路径会初始化代理，Electron 桌面主进程没有对应调用，因此将桌面 runtime 创建前的代理初始化列为修复方向。这个观察属于旧基线调查，不是当前 proxy.4 再现结果。系统代理开关或 `NODE_USE_ENV_PROXY` 本身不构成应用链路验证；TUN 绕路也不构成产品修复。

范围确定为 provider 聊天 HTTP、SSE、WebSocket 与自定义 provider 模型探测。代理设置规则是 Pi `httpProxy` 优先，环境 `HTTP_PROXY`/`HTTPS_PROXY` 兜底，`NO_PROXY` 对两者生效；非法非空配置要明确报错并脱敏。配置启动时读取。SOCKS、PAC、外部浏览器、curl/git/npm 子进程和版本检查器不在这项功能的承诺范围内。对旧版 Undici 中 HTTP provider 连续请求可能超时的担忧是早期调查线索，未经当前依赖版本复验不能当作现存缺陷。

最初列为后续需求的**删除会话**和**简体中文化**仍延期，未随代理、缩放或 v1.0.1 整合实施。早期“尚未 clone／尚未开工／等待确认”之类准备事项已被后续实际开发覆盖；它们只解释当时判断，不再是当前阻塞项。

## 第一阶段：代理支持

在旧上游基线 `97dc3530511310176b171c4d7419127ccd47689c` 建立 `proxy-support`，固定 pnpm 10.25.0 并完成 frozen-lockfile 安装。未修改版的桌面构建、lint、架构和类型检查通过。代理实现覆盖 Node HTTP/SSE/WebSocket 与自定义 provider 模型探测；Pi settings 优先、环境变量兜底、`NO_PROXY` 绕过及非法配置报错均经定向验证。原有认证链路做了契约回归，但没有新增登录实现。

| 检查 | 记录的结果 |
| --- | --- |
| 最终新增 unit | 10/10 通过；TLS 用例改为自包含子进程，父进程无需 `NODE_EXTRA_CA_CERTS` |
| Electron core | 8/8 通过，含 Detect models 通过实际本地代理及 provider/认证契约回归 |
| 真实 Codex | 开发版 WebSocket 和 SSE fallback 各 1 项通过；Windows 目录包各 1 项通过，合计两种传输各有独立证据 |
| 工具调用 | Git Bash 实际执行，核对展开输出及工作区 marker 文件，避免把命令输入误判为工具结果 |
| 代理路由 | `chatgpt.com` CONNECT 200；WebSocket open/send/message；强制 WS 失败后有 HTTP 200 与实际 SSE data 帧 |
| 打包和启动 | Windows 目录包、运行依赖检查、直接启动与快捷方式启动的 exe 路径及隔离 profile 均验证 |

真实验收采用隔离 profile 和私有认证目录，证据不含认证内容；不能据此推断以后版本已重新通过。早期 live 尝试出现路径断言错误、SSE MIME 假设和工具输出断言误判，后来修正测试判定；最终通过依据 `.artifacts/proxy/live-dev-20260925-04` 和 `live-packaged-20260925-05`，早期失败仍保留。仓库 `.artifacts/proxy` 还保存 `self-contained-unit-rerun.log`、`core-proxy-tests.log`、`full-unit-tests.log`、`known-failed-tests.log`、`verify-runtime-deps-windows.log`、启动结果及静态检查日志。源码内 `docs/proxy-support.md` 和 `docs/proxy-validation.md` 保存更细的实现与验收说明。

完整 unit 当时为 251 通过、14 失败、3 跳过。13 项失败在排除新增代理测试的全新 worker 中仍可复现，属于 Windows 文件／路径行为；另 1 项性能预算单跑通过，记录为波动。用户允许排除与代理无关且在未修改版复现的 Windows 旧失败，但这些失败和跳过从未计为通过。未修改版 `CLAUDE.md` 符号链接在无创建权限的 Windows 检出中是普通占位文件，令全量格式检查失败；曾有 574 个 CRLF 格式失败，恢复 LF 后消失。实际静态通过结论排除该占位文件。

第一阶段目录包使用命令级 `--config.win.signAndEditExecutable=false`，因为当时账户不能解压签名工具内的符号链接；未更改系统权限或关闭 TLS 校验。它是未签名目录包，不是安装器，EXE 图标与版本资源可能保留 Electron 默认值。

## 第二阶段：状态、错误与稳定入口

`proxy.2` 安装在 `F:\Apps\pi-gui-proxy\versions\0.1.0-beta.40-proxy.2`。General 中提供版本、代理来源、脱敏地址、`NO_PROXY` 与重启提示；Refresh status 读取启动快照，Open Pi settings 由主进程确定文件路径。错误提示细分设置读取／JSON、非法代理、模型探测网络、认证、限流和服务问题。`personal-deploy.ps1` 管理不可变版本目录、固定入口与回退，失败不切换指针。

开发版设置 1 项、原 General 回归 2 项、稳定目录打包版设置 1 项通过；部署合成测试覆盖拒绝覆盖、非法或损坏包、回退、失败保持指针、子进程数据目录及含空格、`&` 的 CMD 路径。源与安装副本 403 文件、519,933,304 字节；`app.asar` SHA-256 `b31f9b31959ad4b1c324030bd8f2e356ebcffc8526b51e94494b3a98fe4610d8`。证据位于仓库 `.artifacts/proxy-phase2`，以 final 日志和 `packaged-test.log` 为准。

本版拟做的真实账户对话被自动审批拦截，**没有执行**；第一阶段真实对话只能作为旧版历史基线。用户选择亲自试用，早期隐藏 PowerShell `.lnk` 曾被火绒以 `HEUR:Trojan/LNK.Agent.b` 删除，后改成普通可见 CMD helper，未改安全软件设置。此事件只证明当时快捷方式被拦截，不证明包有恶意，也不能断言误报。默认入口仍指向 proxy.1。后续用户反馈 proxy.2 暂未发现问题，属于使用反馈，不代替自动验收。

## 第三阶段：界面缩放

用户反馈整体界面偏小后，加入 90%、100%、110%、125%、150% 的即时整体缩放，以及 Windows Ctrl+-／Ctrl+=／Ctrl+0。比例写入独立 `interface-zoom.json`，不改旧版严格校验的 `ui-state.json`；默认 100%，越界和无效值有安全处理，新窗口与重启读取保存值。`proxy.3` 安装在 `F:\Apps\pi-gui-proxy\versions\0.1.0-beta.40-proxy.3`，与 proxy.2 共用 `%LOCALAPPDATA%\pi-gui-proxy-build` 和单实例锁。未 Activate，默认仍为 proxy.1。

核心自动化 11.9 秒通过；打包版 Appearance 2 项 16.3 秒通过。125%/150% 原生截图经审阅，未见明显布局截断。`main.js`、`preload.js`、renderer `index.html` 和 assets 共 5 项与 `out` 字节一致；源与安装目录各 403 文件、519,939,315 字节，`app.asar` SHA-256 `052ebea6b5498bb09bb7a26852d63eb32435fa3dc3371d578a21c85f21d7ee54`。一次 Ctrl+- 自动化偏差定位到 CDP/input 路线和截图坐标测量，最终核心与打包版复验通过，没有因此改产品 CSS。

证据位于仓库 `.artifacts/interface-zoom/package-check.json`、`.artifacts/interface-zoom/run-packaged/packaged-tests.log` 及截图。没有运行真实 provider，也没有重跑无关 Windows 全量失败。用户试用 proxy.3 后反馈暂未发现问题，仍是使用观察。

## v1.0.1 整合与 proxy.4

上游 `v1.0.1` 发布标签为 `dd5708fb61a38b5012d0ab149b62054d02c1c72f`；相对旧基线 `97dc353` 增加 25 个提交，涉及约 180 文件，因此需要整合而非只换版本号。`70b8e3b` 解决代理初始化与新版主题两处冲突；桌面构建、类型、架构及 root lint 通过。Review 新增／删除文件 diff 修复提交 `174105f`，侧栏按键尺寸同步修复提交 `c4317cf`。第一次开发版界面回归 6 通过、3 失败；另有工具关闭后重启保留 1 项通过。Review 与侧栏经修复后 2 项实际 Electron 复验通过，证据 `review-sidebar.log`；16 主题组合从会累计超时的单例拆成独立用例，全部通过，证据 `theme-matrix.log`。最终开发版定向 UI 结果为 25 通过，不把初次失败批次写作全绿。

定向 unit 最终 15 项通过，包含新增 Git-review 内容回归 1 项。包为 `release-proxy4-final`，产品源码 `c4317cf`，运行依赖检查通过，包内 6 项构建输出 hash 一致。安装到 `F:\Apps\pi-gui-proxy\versions\1.0.1-proxy.4` 后，源与安装目录 403 文件、521,734,927 字节逐文件路径、大小和 SHA-256 一致；`app.asar` SHA-256 `c084a35a4ccd93102c78f966f1a0ff5e26cb080a49a5b6998a36d712704b9004`。

打包版最后 2 项 UI 验收为缩放与代理状态，`2 passed (16.7s)`，单 worker、无重试。日志在仓库 `.artifacts/upgrade-v1.0.1/packaged-final-20260928-a.log`，截图在同级 `packaged-proof-20260928-a`；150% 设置页和主界面原生截图经审阅，未见控件或输入框截断。以上 15 unit、25 dev UI、2 packaged UI 来自不同 lane，**没有运行全套测试，也没有本轮真实 provider 对话**。旧版真实对话与旧 Windows 全量失败都不计入 proxy.4 的通过项。

2026-09-27 为 proxy.4 创建 `%LOCALAPPDATA%\pi-gui-proxy-v1`，从旧应用 profile 冷复制 8 文件；源前后与目标 SHA-256 一致。包含当时的 2 个工作区、15 个会话引用、外观缩放与附件元数据；Pi agent 目录共享，未复制完整会话历史。安装 proxy.4 当时保留了所有旧版本目录和 `state.json` 默认指针；之后 2026-09-28 的清理删除 proxy.1/2 并将默认指针改到 proxy.3。此后两套应用配置独立变化。

## 独立的 pi-pwsh 故障与补丁

五个旧任务元数据曾为 `failed`，`failureKind=infrastructure`，输出仅有 `task launcher disconnected during startup`；未读取任务命令内容。`@4fu/pi-pwsh` 0.10.0 原版用 `process.execPath` 启动 `task-launcher.mjs`，在 Electron 宿主下该路径指向 `pi-gui.exe`，子进程没有 `ELECTRON_RUN_AS_NODE`。诊断认为这是扩展与 Electron 宿主的兼容问题；代理和缩放改动没有修改该链路。

本机扩展安装目录已打局部补丁：只给启动器子进程设置 Node 模式，在启动实际 PowerShell 前恢复调用者原有环境值。隔离 `smoke.mjs` 验证 hello、临时文件读取、环境不泄漏与原值恢复，exit code 0、stderr 为空。该检查不代表已在当时打开的 GUI 窗口重跑工具，窗口须重启或重载扩展。原版备份、补丁副本、日志、SHA-256 和回退步骤都在 [pwsh 诊断目录](../../extension-maintenance/pwsh-diagnosis/README.md)。npm 安装或升级扩展可能覆盖它；此改动独立于 `app.asar` 和 v1.0.1 Git 累计补丁。

## 补丁、证据与后续维护边界

| 目录 | 对应内容 |
| --- | --- |
| `proxy-patches` | 第一阶段 3 份提交补丁：代理实现、测试、使用与验证说明 |
| `proxy-patches-phase2` | 第二阶段 2 份补丁：状态与错误、稳定启动／回退 |
| `proxy-patches-phase3` | proxy.3 的实现和文档／证据修正 2 份补丁 |
| `proxy-patches-v1.0.1/personal-changes-on-v1.0.1.patch` | 从本地 `3f6a005` 导出的相对官方标签 `v1.0.1` 的累计 Git binary diff；含代理、状态、缩放、Windows Review／侧栏修复、测试和维护文档 |
| `pwsh-diagnosis` | 扩展补丁、副本、0.10.0 原文件备份与隔离 smoke 证据；不包含在上述 Git diff |

累计补丁只适合干净且相同的 `v1.0.1` 基线；先在独立源码副本 `git apply --check`，再决定应用。后续上游更新须审冲突、重新构建独立包并复验，不能把旧版验收无条件迁移到新版。详见 [累计补丁说明](../../source-patches/proxy-patches-v1.0.1/README.md)。所有版本均未制作安装器；代理第一阶段和第二阶段的 Windows 目录包历史上记录为未签名，其安装副本现已清理。源码个人分支已于 2026-09-28 推送至自己的 fork；本目录的独立资料与 pwsh 补丁仍需另行备份。

## 2026-09-28 用户扩展验收补充

本轮仅变更用户 npm 安装上下文与 pi-subagents 的局部显示文件，未改源码提交或 app.asar。依赖修复后原生 ESM 执行器导入成功；实际 proxy.4 隔离窗口验证 `/subagents-models scout` 执行、展开面板并显示完整模型映射。其余四个扩展经真实 factory、生命周期和 GUI context 验证工具 handler：pwsh 简单输出、todo 创建/列表、web raw 页面抓取通过，ask_user_question 因 host 不支持 terminal-only custom UI 而失败。没有真实模型请求；无参数模型映射命令未单独实测；不覆盖搜索、视频或完整子代理任务。

细节、前后依赖锁文件、补丁原件、截图与可复运行脚本统一保存在 [扩展诊断目录](../../extension-maintenance/subagents-diagnosis/README.md)。这批本地资料与扩展补丁不在之前 GitHub 源码推送中。

### 提问扩展后续修复

上述 ask_user_question 失败随后按用户授权修复：仅在 GUI 返回明确的 custom/terminal-only 错误时进入既有 select/input 流程，保留其他异常与 CLI 行为，并修正回退等待期间 finally 提前清理的风险。实际 proxy.4 GUI 中 7 次交互验收通过，涵盖单选、自定义、多选编号、取消、连续调用和第二题取消；无真实模型请求。补丁、原文件哈希、边界验证及截图见 [提问扩展修复记录](../../extension-maintenance/subagents-diagnosis/ask-repair/README.md)。此为本机扩展补丁，包更新可能覆盖。

## 2026-09-28 后台子代理代理修复（已安装）

原因：GUI 主进程读取了全局 Pi settings.httpProxy，但 pi-subagents 的独立后台 runner 原先仅依赖代理环境变量，因此主会话能联网，后台子代理仍可能直连失败。

已修复 pi-subagents 0.73.1 的 src/runs/background/runner-http-dispatcher.js：优先使用全局 settings.httpProxy，留空时使用 HTTP_PROXY/HTTPS_PROXY，保留 NO_PROXY；无效显式配置报错，不静默直连。未改应用包，仍使用 proxy.4。扩展升级可能覆盖本地补丁。

验收：独立 Node 子进程清空代理环境变量后，HTTP、SSE、global WebSocket 均被本地 CONNECT 代理记录；NO_PROXY 直连通过；不可达显式代理没有直连回退。真实安装版后台执行入口调用 openai-codex/gpt-6-luna，返回 PROXY_OK，result.json success=true、state=complete、exitCode=0，未发现 WebSocket error / fetch failed。未覆盖 GUI 提交到后台的完整启动握手及 Bun 运行时。

请完全退出并重新打开 Pi GUI，再测试一个只返回 OK 的后台 Luna 子代理任务。

证据及备份：subagents-diagnosis/background-proxy-repair；真实请求记录 live-runs/2026-09-28T15-56-17.445Z/result.json。本地扩展补丁未包含于此前 GitHub 源码推送。

## 2026-09-29 单版本日用整理

用户确认 proxy.4 试用正常，决定仅保留该 GUI 版本，故障时改用 CLI。已删除 proxy.3 安装、旧测试版快捷方式和多版本启动脚本；桌面统一为 Pi GUI，图标来自 proxy.4 内置资源。固定 CMD 入口保留原 proxy.4 数据目录设置，已回读核对快捷方式目标、参数、图标及可执行文件存在；未实际打开 GUI，因此不将这些检查记为启动实测。

本轮进一步按用户“还能复用就保留”的选择：保留源码、开发依赖、构建工具缓存、编译输出、验收截图/运行记录、测试脚本、补丁和原文件备份。只清除已完成依赖修复的一次性 npm-cache/stage 与四个明确的隔离代理测试临时目录。临时认证副本随隔离目录一起删除，真实认证与会话未动。

两个清理清单为 cleanup-installed-20260929.json 与 cleanup-disposable-20260929.json。共移除约 692.9 MiB 逻辑文件体积；这是磁盘文件大小，不是进程内存占用或已测量的实际可用空间增量。Git 工作区保持干净，未修改远程历史。新增 AGENTS.md，更新 README 和使用维护指南。本文前面的双版本/旧启动器说明均为历史记录。

## 2026-09-29 补丁检查与安全恢复工具

新增 patch-manager 零依赖 Node CLI、精确版本/SHA-256 清单、中文双击只读入口和使用说明。默认 check/repair预览只读；明确 --apply --confirm-closed 才写入。每次修复先备份并记录事务，undo只撤销本工具事务，版本或未知内容不匹配时停止；SDK只检查不自动安装。15类隔离文件场景全部通过，独立审查发现的问题均已修正。实际安装只读check：5个补丁已安装、4个SDK正常；本轮未改真实扩展、未改GUI、未联网调用模型。详见 patch-manager/verification/REPORT.md。

## 2026-10-10 Percho 0.6.4 代理修复及 2026-10-11 卸载

状态更新：用户试用后认为 Percho 不适合，已卸载。只读检查未发现原安装目录及开始菜单快捷方式；两个 Percho 数据目录仍保留，完整候选 ASAR 后续按用户授权删除。本节以下内容仅作历史实施与验收记录，不表示当前仍安装或建议恢复 Percho。

用户已安装 Percho，授权修复 GPT 直连失败并指定由 Luna 子代理实施，负责人审查方案和真实运行结果。安装位置为 `F:\AI\percho`，运行时 Electron 43.3.0 / Node 24.18.1，Pi package 1.0.4。静态调查发现 Electron 主进程未初始化 Pi HTTP/WebSocket 代理，单独设置环境变量不足以证明链路正常。

在原 main 中增加 142 bytes 的初始化调用，外置 `percho-proxy-init.cjs` 复用 ASAR 已有 undici 8.10.2：Pi `httpProxy` 优先、环境 HTTP(S)_PROXY 兜底、保留 NO_PROXY，错误配置脱敏报错且不直连回退。结构化 ASAR 改写保留原文件树和 unpacked/link 元数据，main 前后原始 payload 的哈希不变。未重建 EXE、升级依赖或改变快捷方式、真实 Pi 配置与旧 GUI。

原 ASAR 完整备份保存在 `F:\AI\percho\resources\app.asar.pre-proxy-0.6.4-20261010.bak`；备份 SHA-256 `636b508dbf7d3d69e6e77f4a15d34e265fc6bae3d409b64330ac41de2e8cc65a`。安装后 ASAR SHA-256 `cc989d48edcfad1783f37be3b5de2687c1b44c0600337122ae5d440a319bc819`，抽取的 main 和 helper 均与候选哈希一致。首次部署因 PowerShell 不支持 Copy-Item 的 NoClobber 参数中断，仅留下已核验的原包备份；修正部署脚本后成功，未关闭用户 GUI。

验证分两层：本地模拟使用 Percho 内置 Node/undici，HTTP/SSE、WebSocket Upgrade、NO_PROXY、环境代理兜底、错误设置拒绝及不可达代理无直连回退通过；HTTPS fixture 仅观察 CONNECT，随后主动断开。正常安装版隔离运行调用自身 `window.pi.testProvider`，`openai-codex/gpt-6-luna` 返回 `ok=true`；主进程 dispatcher 为 EnvHttpProxyAgent，WebSocket constructed/opened 均为 1、收到 12 条消息，代理记录 `chatgpt.com` CONNECT 200 两条并有双向数据。最终测试 exit 0，证据为 [packaged live 摘要](./percho-proxy-diagnosis/verification/packaged-live-summary.json)。

前两次隔离运行的 harness 在退出清理阶段失败，没有保存完整结论，不计为有效验收。修正进程退出等待与 Windows 临时目录删除重试后最终测试通过；三次隔离测试目录均已清除，真实认证和会话未修改。没有观察到真实 HTTP fetch，故不将真实 provider HTTP/SSE fallback 记为通过；未覆盖完整会话、所有扩展或独立 runner。Percho 更新可能覆盖本地补丁，应重新比较版本与哈希，不能盲目覆盖新版。诊断、补丁源码及部署说明见 [Percho 代理诊断](./percho-proxy-diagnosis/REPORT.md)，安装包与原包备份不提交 Git。

## 2026-10-11 试用软件与扩展资料清理盘点

用户反馈已卸载 Percho，认为不适合。只读确认原安装目录 `F:\AI\percho` 和开始菜单快捷方式不存在；`%APPDATA%\@percho\desktop`、`%USERPROFILE%\.percho` 仍存在，未查看内容或删除。用户随后授权删除 Percho 诊断目录中的完整候选 ASAR（373,785,941 字节，SHA-256 `CC989D48EDCFAD1783F37BE3B5DE2687C1B44C0600337122AE5D440A319BC819`）；其余诊断源码与报告保留作历史记录。

按 `cleanup-disposable-20261011.json` 清除 7 个隔离 Electron 测试 profile 内 42 个 Chromium/GPU 缓存目录，共 172 个文件、26,659,656 字节逻辑文件。清理未涉及测试状态、证据、脚本、报告或 Pi 全局数据；删除后确认 42 个目标目录均不存在。该值是文件逻辑大小，不代表实测磁盘空间净增量。

同日运行 `patch-manager.mjs check --json`：实际安装版本为 `@4fu/pi-pwsh` 0.11.0、`pi-subagents` 0.77.0、`@juicesharp/rpiv-ask-user-question` 2.12.0，工具清单仍锁定旧版，5 个补丁均因 `version_mismatch` 标记 `unsafe`，未尝试修复或手工覆盖；四个 GUI SDK 依赖均为 0.87.1。新版本补丁兼容性需要另行对比评估。

