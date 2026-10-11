# 恢复与本地清理说明

## 恢复源码

```powershell
git clone --branch proxy-support https://github.com/new595/pi-gui.git
cd pi-gui
```

个人代理、状态显示、界面缩放和 Windows 修复已在该分支源码中。不要在此分支上重复应用归档 patch；仅在需要从对应干净上游基线重放时，使用 `source-patches/proxy-patches-v1.0.1/personal-changes-on-v1.0.1.patch`，并先执行 `git apply --check`。

源码根目录有 pnpm-lock.yaml；packageManager 为 pnpm 10.25.0。历史 Windows 解包构建入口如下，需先准备适合此项目的 Node/pnpm、原生模块构建工具并阅读仓库 AGENTS.md 与构建脚本：

```powershell
pnpm install --frozen-lockfile
pnpm package:win:dir
```

构建输出通常在 apps/desktop/release 下，具体以 electron-builder.yml 为准。上面是保存的构建入口，本次备份没有重新构建或验证工具链。发布、签名和自动更新不属于这次归档。

## 恢复扩展兼容能力

保留的 before/after 只供对应旧版本比较。patch-manager 与 pwsh-diagnosis、subagents-diagnosis 的相对位置必须保持，因此它们一起放在 extension-maintenance 下。

```powershell
node docs/personal-gui-backup/extension-maintenance/patch-manager/patch-manager.mjs check
```

默认检查位置仍为当时的 C:\Users\lwj\.pi\agent\npm；其他电脑应通过 --root 指定实际 npm 根目录。check 只读。repair 默认预览；仅确认版本及哈希匹配、退出所有相关 Pi GUI/CLI 后，才允许 --apply --confirm-closed。事务备份保存在工具目录的 transactions，未上传本地事务和测试 fixtures。

四个 @earendil-works SDK 0.87.1 的历史安装方式和 before/after npm 锁文件放在 subagents-diagnosis。它们记录旧 GUI 的兼容方案，不应拿来降级当前 CLI 或直接替换现有共享安装。优先重新适配当前扩展，并评估 GUI 独立扩展依赖树。

恢复后的验证至少应覆盖：GUI 代理、整体缩放、PowerShell、提问交互、子代理模型结果显示、后台子代理代理以及实际 Windows 打包启动。归档中的测试结果不能替代恢复后的验收；历史验证脚本有本机绝对路径和依赖，需要按实际环境调整。所有会读取真实认证或调用模型的脚本只能在明确授权和隔离环境中运行。

## 恢复启动入口

`launcher/pi-gui-proxy.cmd` 是卸载前的实际入口。它假定版本目录为 F:\Apps\pi-gui-proxy\versions\1.0.1-proxy.4，并设置 PI_APP_USER_DATA_DIR=%LOCALAPPDATA%\pi-gui-proxy-v1。重新安装时按真实目录调整，但保留原数据目录约定，避免直接启动 exe 后使用不同 profile。

旧 docs/personal-builds.md 与其他报告提到的多版本 state.json 启动器已经在 2026-09-29 删除，属于历史方案；它不是当前入口。

## 备份完成后可清理的程序资料

在 GitHub 上确认本次归档提交存在后，可以移除：

- F:\Apps\pi-gui-proxy 程序安装目录和桌面 Pi GUI.lnk。
- F:\GitHub-repository\pi-gui 本地源码、开发依赖与构建缓存，之后可重新 clone。
- F:\learn\Pi-GUI相关文档 内已经列入 metadata/file-manifest.json 的 GUI 维护资料。此目录还含未上传的 Percho、Pi TUI 主题和原始证据，不能把“GUI 备份完成”理解为整目录所有内容都已备份。

## 用户数据另行处理

GitHub 没有备份 %LOCALAPPDATA%\pi-gui-proxy-v1 和旧 pi-gui-proxy-build profile；其中可能有界面设置、草稿或 GUI 状态。若将来需要恢复这些内容，应保留本地目录或另做私有本地备份。

C:\Users\lwj\.pi\agent 与 CLI 共用，包含认证、配置、模型、扩展和会话；继续使用 CLI 时必须保留，不要当作 GUI 残留删除。全局 Node/Pi CLI、CLI 快捷入口同样不属于 GUI 清理范围。

本轮只做 GitHub 归档备份，没有卸载、删除本地文件或修改 CLI 配置。
