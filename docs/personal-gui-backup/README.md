# Pi GUI 个人版归档备份

归档日期：2026-10-11。用户决定暂时卸载 GUI，必要时使用 Pi CLI。此目录保存重新开发、适配和构建个人 GUI 所需的资料；它不是程序安装包或个人数据备份。

源码已在本仓库 `proxy-support` 分支中，个人源码和测试/文档基准提交为 `3f6a005b65be454f65fdf64e500527368b2a65c7`，proxy.4 安装包产品源码为 `c4317cfbce2e1a6e16da51d686d2f6f75b4d00f6`。此次归档只新增维护资料，保留已有历史，不修改产品源码。

## 从哪里开始

| 目录或文件 | 用途 |
| --- | --- |
| [RESTORE.md](./RESTORE.md) | 重建顺序、依赖和验证边界，以及本地清理前注意事项 |
| [documents/current](./documents/current) | 当时的使用说明、维护约定和文档索引 |
| [documents/history](./documents/history) | 开发验收记录和扩展更新检查报告 |
| [documents/assessment](./documents/assessment) | GUI 长期维护路线评估 |
| [source-patches](./source-patches) | 各阶段源码补丁及相对官方 v1.0.1 的累计补丁 |
| [extension-maintenance](./extension-maintenance) | 扩展修复前后文件、维护工具、验证源脚本与文字报告 |
| [launcher](./launcher) | 最后使用的启动脚本，包含独立 GUI 数据目录设置 |
| [metadata](./metadata) | 构建身份和归档文件 SHA-256 清单 |

目录中的历史报告会提到本机截图、测试日志和运行记录。这些原始产物未上传；文字结果是历史证据，不代表今天或恢复后的新验证。Markdown 的本归档内链接已按分类映射，指向未上传产物的链接可能无法打开。

## 必须了解的状态

- 最后使用的 GUI 为 `1.0.1-proxy.4`，Electron 为 37.10.3，内置 Pi SDK 为 0.87.1；运行时升级及扩展隔离没有实施。重新长期使用前需要评估兼容与安全维护。
- 旧扩展补丁只针对 `pi-pwsh 0.10.0`、`pi-subagents 0.73.1`、提问扩展 `2.11.0`。2026-10-11 记录的公共扩展已分别为 0.11.0、0.77.0、2.12.0。
- 补丁工具拒绝未知版本是预期保护。不要覆盖新版文件，也不要把旧 npm 清单与锁文件直接覆盖到当前 CLI 扩展目录。
- 扩展第三方源码归档保留 MIT 许可证与来源说明，见 [THIRD-PARTY-NOTICES.json](./extension-maintenance/THIRD-PARTY-NOTICES.json)。

未上传认证、token、用户 settings/models 配置、真实会话、GUI profile、二进制安装包、node_modules、缓存和原始测试运行目录。Percho 与 Pi TUI 主题资料不属于本次 GUI 归档范围。
