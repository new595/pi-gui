> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# v1.0.1 个人改动备份

`personal-changes-on-v1.0.1.patch` 是相对官方标签 `v1.0.1`（`dd5708fb61a38b5012d0ab149b62054d02c1c72f`）的累计 Git binary diff，导出自本地 `proxy-support` 提交 `3f6a005`。

补丁包含代理支持、状态显示、整体缩放、Windows Review/侧栏修复、相应测试及维护文档。它只适用于干净的同一上游基线；先在独立源码副本执行 `git apply --check`，再决定应用，不要直接覆盖正在维护的工作区。后续上游版本需要重新核对和验收。

实际安装包产品源码为 `c4317cf`；后续 `dd85a44` 与 `3f6a005` 仅更新测试和文档，没有改变应用构建。没有远程推送或 PR。

本机 pi-pwsh 扩展补丁不包含在此 Git diff 中，见 [PowerShell 扩展补丁](../../extension-maintenance/pwsh-diagnosis/README.md)，原文件和修改副本均已保留。

