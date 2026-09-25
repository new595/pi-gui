# Windows 桌面代理支持

本文说明 pi-gui 桌面主进程中的 provider 代理配置与维护范围。代理在应用启动时读取 Pi 全局 agent 设置；修改配置后需完全退出并重新启动 pi-gui。

## 配置

首选在 Pi agent 目录的 `settings.json` 中设置 `httpProxy`。Pi 0.87.1 的公开 `getAgentDir()` 使用 `PI_CODING_AGENT_DIR`（或默认 `~/.pi/agent`）解析该目录。示例：

```json
{
  "httpProxy": "http://127.0.0.1:7890"
}
```

代理地址只支持 `http://` 和 `https://`。SOCKS、PAC 及其他 scheme 不支持。显式设置必须是字符串和有效 URL；非字符串、格式错误或不支持的 scheme 会阻止应用启动，并提示检查配置。空白字符串视为未设置。错误提示不应包含代理用户名、密码或 URL。

缺少显式设置时使用环境变量。环境变量按目标协议选择：

| Pi `httpProxy` | `HTTP_PROXY` | `HTTPS_PROXY` | HTTP / `ws://` | HTTPS / `wss://` |
| -------------- | ------------ | ------------- | -------------- | ---------------- |
| 有效非空       | 任意值       | 任意值        | 显式代理       | 显式代理         |
| 缺失或空白     | 已设置       | 已设置        | `HTTP_PROXY`   | `HTTPS_PROXY`    |
| 缺失或空白     | 已设置       | 未设置        | `HTTP_PROXY`   | `HTTP_PROXY`     |
| 缺失或空白     | 未设置       | 已设置        | 直连           | `HTTPS_PROXY`    |
| 缺失或空白     | 未设置       | 未设置        | 直连           | 直连             |

一个有效的显式 `httpProxy` 优先于环境代理；此时即使环境中的 `HTTP_PROXY` 或 `HTTPS_PROXY` 内容非法，也不会影响该显式配置。没有有效显式值时，非法的已设置环境代理会产生安全错误，不会静默回退直连。大小写环境变量名归一为同一配置槽，不视为两个独立代理。

`NO_PROXY`（也可用小写 `no_proxy`）在显式和环境代理下都生效，命中时绕过代理。实现采用 Undici 8.5 `EnvHttpProxyAgent` 语义：逗号或空格分隔的主机项；支持主机、子域、`.example.com` / `*.example.com` 通配符、可选 `:port`，以及单独的 `*` 全部绕过。环境值会在启动时读取为快照，运行中更改变量或 settings 文件都需重启。

没有 GUI 代理开关，也没有热更新。本模块不改写 `process.env`。

## 覆盖范围

初始化发生在 Electron `app.whenReady()` 处理期间、创建 Pi provider runtime 之前。Node 全局 Undici dispatcher 与 `undici.install()` 用于 provider HTTP、流式 HTTP/SSE、OpenAI Codex Responses WebSocket，以及 Pi OpenAI Codex OAuth 授权码交换和 token 刷新。Pi 0.87.1 OAuth 源码调用全局 `fetch`；Codex provider 非 Bun 路径使用 `globalThis.WebSocket`。这说明请求会进入本进程的全局 Node 网络配置，但源码检查本身不证明代理握手或真实账号流量已通过验收。

桌面自定义 provider 模型探测调用配置后的全局 `fetch`，因此采用同一代理配置。`electron/platform/update-checker.ts` 使用 Electron `net.fetch` 请求 GitHub Releases，不由 Undici dispatcher 覆盖。当前应用在启动约 15 秒后检查一次，之后每 4 小时检查 GitHub Releases；发现新版本时显示通知，点击后打开 Release 页面。检查器本身没有下载或安装更新的逻辑。`electron-builder.yml` 中的 GitHub `publish` 配置是构建发布目标，不等于应用内自动安装更新。外部浏览器打开的页面也不属于本进程的代理承诺。

由工具启动的 `curl`、`git`、`npm` 等子进程不由本模块自动代理；它们各自按自身配置和环境变量工作。本文不声称 pi-gui 的所有网络流量都已代理。

## Windows 目录包隔离

优先使用 Windows 目录包进行验证，将其保存在独立目录并使用包内的 `Start pi-gui proxy build.lnk` 快捷方式启动；不要将文件复制覆盖到官方安装目录。快捷方式调用同目录的 `Start pi-gui proxy build.cmd`，启动脚本仅将 Electron `userData` 指向 `%LOCALAPPDATA%\pi-gui-proxy-build`，保留默认 Pi agent 目录与 settings 配置。NSIS 安装器和 portable 包可能与其他安装共享应用身份，应在核对应用身份、数据目录后再考虑使用。

当前主进程将 Electron `userData` 默认设为 `pi`，可通过 `PI_APP_USER_DATA_DIR` 改到专用目录；这可隔离 pi-gui 的应用数据。Pi provider 设置、模型目录及认证由 Pi agent 目录管理，默认仍与 Pi CLI 共用 `~/.pi/agent`。如需完全隔离运行，应在启动目录包的专用快捷方式环境中设置独立 `PI_CODING_AGENT_DIR`，并在该目录建立独立 `settings.json`；不要复制认证文件。两个隔离变量都要在启动进程环境中设置。确认目标快捷方式指向独立目录包后，再进行启动验证。

## 上游维护

当前补丁基于 pi-gui 上游提交 `97dc3530511310176b171c4d7419127ccd47689c`，所在分支为 `proxy-support`；`upstream` 指向 `https://github.com/minghinmatthewlam/pi-gui.git`。Pi 运行时依赖核对版本为 `@earendil-works/pi-coding-agent` 与 `@earendil-works/pi-ai` `0.87.1`，Undici 为 `8.5.0`。同步上游或升级这些依赖后，重新核对 Electron main 启动顺序、`getAgentDir()` 导出、`EnvHttpProxyAgent` 行为、OAuth fetch 和 Codex WebSocket 实现；保持代理代码为独立小补丁并重新执行相关验证。

Windows 目录包因 Windows code-sign 工具归档包含 macOS 符号链接、而普通开发权限无法解压时，可在确认适用后对单次打包命令覆盖 `--config.win.signAndEditExecutable=false`，例如：

```powershell
pnpm exec node scripts/package-windows.mjs --win --dir --publish never --config.npmRebuild=false --config.win.signAndEditExecutable=false
```

这只影响本次目录包命令，不修改 `electron-builder.yml`、全局权限或证书验证设置；产物未签名，且 exe 图标、版本资源可能保留 Electron 默认值，必须在实际产物中核实。不要把该临时覆盖误当作发布签名配置。

不要把带真实凭据的代理 URL、代理密码、token、`auth.json` 内容或个人认证日志写入文档、测试样例和提交。文档中的本机代理地址仅用 `127.0.0.1:7890` 示例。

## 源码核对记录

以下是实现范围的静态源码依据，不代表完整 Windows Electron 或真实 provider 验收已经通过：

- Pi 0.87.1 的 `dist/auth/oauth/openai-codex.js`：`fetchWithLoginCancellation()`、`exchangeAuthorizationCode()`、`refreshAccessToken()` 分别在 85–94、112–125、127–145 行使用全局 `fetch`。
- Pi 0.87.1 的 `dist/api/openai-codex-responses.js`：733–736 行在非 Bun runtime 读取 `globalThis.WebSocket`，795 行创建 socket。
- pi-gui 的 `apps/desktop/electron/main.ts`：815–833 行在 runtime 创建前初始化代理。
- pi-gui 的 `apps/desktop/electron/network/provider-model-probe.ts`：默认 fetch 参数为 `globalThis.fetch`。
- pi-gui 的 `apps/desktop/electron/platform/update-checker.ts`：59 行使用 Electron `net.fetch`；`electron-builder.yml` 122–125 行声明 GitHub 发布目标，但检查器只查询 releases 并打开页面。
- pi-gui 的 `apps/desktop/electron/main.ts`：791–794 行将应用名设为 `pi` 并设置 `userData`，可选读取 `PI_APP_USER_DATA_DIR`。
- Pi 0.87.1 的 `dist/config.js`：405–426 行公开的 `getAgentDir()` 使用 `PI_CODING_AGENT_DIR`，缺省目录为用户 home 下 Pi 配置目录。
