> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Pi GUI 个人版文档

更新：2026-10-11。当前唯一日用安装版本：**1.0.1-proxy.4**。桌面入口：**Pi GUI**。用户已决定不保留旧 GUI 回退版本，必要时使用 CLI。

- [使用与维护](./PI-GUI-使用与维护.md)：当前启动方式、代理、缩放、扩展修复和数据位置。
- [AGENTS.md](./LOCAL-AGENTS.md)：后续代理维护本机环境的约定。
- [开发与验收记录](../history/PI-GUI-开发与验收记录.md)：历史变更与验证范围；旧版启动说明已被当前维护文档替代。
- [扩展修复记录](../../extension-maintenance/subagents-diagnosis/README.md)、[PowerShell 修复](../../extension-maintenance/pwsh-diagnosis/README.md)：本地扩展补丁和备份。
- [v1.0.1 累计源码补丁](../../source-patches/proxy-patches-v1.0.1/README.md)：仅适用于对应干净上游基线。
- [本轮安装清理清单](./cleanup-installed-20260929.json)：已删除的旧版本与入口。
- [2026-10-11 临时缓存清理清单](./cleanup-disposable-20261011.json)：隔离扩展验收 profile 中已删除的缓存，以及 Percho 遗留项核对结果。
- [补丁维护工具](../../extension-maintenance/patch-manager/README.md)：默认只读检查；仅在精确版本与哈希匹配时恢复，未知变更不覆盖；撤销仅限本工具事务，不自动升级依赖。

源码在 F:\GitHub-repository\pi-gui，分支 proxy-support，上次推送提交 3f6a005。安装在 F:\Apps\pi-gui-proxy\versions\1.0.1-proxy.4。GitHub 历史保留；本目录和本地扩展补丁未包含于先前源码推送。
