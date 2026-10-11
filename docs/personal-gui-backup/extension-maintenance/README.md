# 扩展维护资料

- [pwsh-diagnosis](./pwsh-diagnosis/README.md)：PowerShell Electron 兼容补丁；真正原版在 backup-0.10.0-20260927。
- [subagents-diagnosis](./subagents-diagnosis/README.md)：子代理显示、后台代理、依赖修复、提问回退和验证源脚本。
- [patch-manager](./patch-manager/README.md)：只读检查和精确版本/哈希匹配的修复与撤销工具。
- [THIRD-PARTY-NOTICES.json](./THIRD-PARTY-NOTICES.json)：第三方来源和许可证获取版本；许可证原文在 licenses。

补丁文件不是完整扩展安装包。恢复时必须先准备匹配版本及完整依赖，再依据差异适配。不能单独运行 task-launcher 等依赖同包模块的文件。工具的目录关系已保留，复制时应整体保留 extension-maintenance 结构。

subagents-diagnosis 的 task-runtime.before.ts / task-launcher.before.mjs 是 SDK 依赖安装操作前的备份，当时已经打过补丁；不要将它们误认为 pwsh 原版。
