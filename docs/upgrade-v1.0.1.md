# v1.0.1 proxy.4 个人版交付记录

## 构建身份与安装

- 版本：`1.0.1-proxy.4`
- 源码提交：`c4317cfbce2e1a6e16da51d686d2f6f75b4d00f6`
- 基线提交：`dd5708fb61a38b5012d0ab149b62054d02c1c72f`
- 安装目录：`F:\Apps\pi-gui-proxy\versions\1.0.1-proxy.4`
- 启动程序：`F:\Apps\pi-gui-proxy\versions\1.0.1-proxy.4\pi-gui.exe`
- 独立测试启动器：`F:\Apps\pi-gui-proxy\scripts\launch-proxy4-test.cmd`
- 桌面快捷方式：`Pi GUI v1.0.1 proxy.4 测试版.lnk`
- 用户数据目录：`%LOCALAPPDATA%\pi-gui-proxy-v1`

安装清单位于版本目录 `manifest.json`。包归档 `resources/app.asar` 的 SHA256 为 `c084a35a4ccd93102c78f966f1a0ff5e26cb080a49a5b6998a36d712704b9004`。安装前确认目标目录不存在；安装后源与目标逐文件路径、大小和 SHA256 一致：403 个文件，合计 521,734,927 字节。默认 `state.json` 仍选择 `0.1.0-beta.40-proxy.1`，本次没有 Activate，也没有启动用户日常 profile；打包版界面验收使用隔离 profile。

## 验收状态

打包时的 runtime 依赖检查通过，源码与归档记录见 `.artifacts/upgrade-v1.0.1/package-check-final.json`。分 lane 检查结果：15 unit、25 dev UI 与 2 packaged UI 用例通过；25 项开发版界面检查已包括 16 种主题组合与 Review/侧栏修复复验。packaged UI 证据见 `.artifacts/upgrade-v1.0.1/packaged-final-20260928-a.log` 和 `packaged-proof-20260928-a`。这些是不同 lane 的检查结果，并非一次完整全套测试；本轮没有运行真实 provider。

之前已完成 `%LOCALAPPDATA%\pi-gui-proxy-build` 到 `%LOCALAPPDATA%\pi-gui-proxy-v1` 的冷迁移，8 个文件的 hash 匹配证据记录在 `.artifacts/upgrade-v1.0.1/migration-evidence.json`。这是 2026-09-27 的配置快照：之后在旧版中产生的配置变化不会自动同步到新 profile。Pi 会话目录仍共享，因此该 profile 不是完整的会话历史快照。迁移数据未由本次发布重新复制或覆盖。

## 启动与回退

先正常退出当前运行的旧版 Pi GUI，再用桌面快捷方式启动 proxy.4 进行测试；该快捷方式调用普通可见 CMD，CMD 再调用 `launch-proxy4-test.cmd`，并将 GUI 进程的 `PI_APP_USER_DATA_DIR` 设为独立的 `pi-gui-proxy-v1` 目录。原稳定启动器的 current/previous 选择不受影响。

回退时先完全退出 proxy.4，再打开桌面 `Pi GUI proxy.3 测试版`，即可使用升级前的版本和原桌面配置。无需修改 state.json。proxy.4 安装目录和独立配置保留。

## PowerShell 扩展兼容补丁

另有针对本机 `@4fu/pi-pwsh` 0.10.0 的 Electron 子进程环境兼容补丁，源码副本、隔离 smoke 结果和回退步骤记录于 `F:\learn\Pi-GUI相关文档\pwsh-diagnosis\README.md`。隔离 smoke 已通过；正在打开的 Pi 窗口需重启或重新加载扩展后才能读取磁盘补丁。npm 重新安装或升级该扩展可能覆盖补丁。此补丁在扩展安装目录中，不包含于 proxy.4 应用包。