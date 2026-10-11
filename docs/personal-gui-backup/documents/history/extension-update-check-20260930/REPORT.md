> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# 扩展更新后的使用与审计检查（2026-09-30）

## 结论

用户执行 `pi update --extensions` 后，`pi-web-access` 已安装为 0.34.0。未发现本次更新导致扩展加载失败；真实抓取工具和存储内容读取通过。安全审计仍报告 3 个受影响包条目（1 moderate、2 high），不能把加载/抓取通过解释为安全漏洞已修复。

本次没有安装、升级、降级或修复依赖，没有更改扩展源码、GUI 安装、启动入口或真实用户配置，也没有调用模型或用户会话。

## 检查与证据

- `patch-check.json`：补丁维护工具退出码 0；5 个既有补丁文件版本和哈希匹配，4 个用于 GUI 兼容的 SDK 仍为 0.87.1。
- `cli-sdk-result.json`：全局 Pi CLI 0.99.1 对应 SDK 的真实扩展加载器成功加载 5 个扩展，无加载错误；网页工具参数检查和缺失内容处理通过。
- `gui-sdk-result.json`：GUI 对应的已安装 0.87.1 SDK 加载器也成功加载 5 个扩展。调用已安装 `pi-web-access/dist/index.js` 注册的 `fetch_content`，以 raw 模式经已有代理读取 `https://example.com/`，successful=1，找到 Example Domain；随后 `get_search_content` 成功取回存储内容。
- `audit-online.json`：对 `C:\Users\lwj\.pi\agent\npm` 显式使用 `--offline=false` 和 npm 官方 registry 的只读审计，退出码 1，复现截图中的 3 个受影响包条目。
- `verify.mjs`：保留可重复的隔离检查脚本。只复制非凭据的网页工具开关与命名等设置；缓存和临时配置写入本目录的 `isolated-*`。会话 appendEntry 使用内存记录，无真实会话写入。

当前工具执行环境的 npm 默认配置包含 offline=true。最初未显式覆盖该值的审计返回 0，该结果无有效联网审计意义，已弃用；最终判断仅使用 `audit-online.json`。

隔离加载时，pi-subagents 因无法确认测试脚本所属的真实宿主而提示保持工具直接可用。该提示没有阻止注册，也不能由此推断真实 GUI/CLI 会话中的动态工具激活行为。

首次联网抓取在受限沙箱中返回 spawn EPERM。获准在沙箱外执行同一隔离脚本后通过，最终结果见 gui-sdk-result.json；该沙箱限制不构成插件在用户桌面运行时故障的证据。

## 剩余安全问题

| 审计包条目 | 等级 | 当前来源与版本 | 判断 |
| --- | --- | --- | --- |
| brace-expansion | high | GUI 兼容 SDK pi-coding-agent 0.87.1 下的 5.0.9 | 受影响范围内，包含特殊括号模式造成资源耗尽/递归崩溃的问题 |
| undici | high | 扩展 npm 根目录下的 8.10.0，pi-subagents 0.73.1 固定依赖 | 受影响范围内，多项网络相关 advisory；具体运行路径是否触发未测试 |
| pi-subagents | moderate | 0.73.1 | 因依赖 undici 而被列为受影响包，不是另一个独立根因 |

`pi-web-access` 0.34.0 使用自己的 `undici` 8.11.2 副本，该副本未被本次审计列为受影响节点；GUI SDK 内另有 8.10.2，也未被列为受影响节点。因此不能看到 npm 的汇总就认为刚更新的网页扩展本身仍使用 8.10.0。

npm 为 pi-subagents 提供的 fixAvailable 是降至 0.65.0，标记为需要 force 的范围外版本变动。没有执行 `npm audit fix` 或 `npm audit fix --force`。应先调查依赖与兼容范围，保留本地补丁及备份后再确定具体修复。

2026-09-30 用户选择：暂不修复这些依赖，等待兼容的上游更新；不执行强制审计修复、降级或额外本地依赖补丁。当前加载和网页抓取通过支持继续日常使用，但安全问题仍存在，未证明相关漏洞不会被触发。brace-expansion 来源于 GUI 对应 SDK，单独更新网页扩展不一定消除全部提示。后续更新仍须检查现有本地补丁是否被覆盖。

## 验证边界

这次验证了实际安装文件的加载/注册，以及网页抓取和存储读取；没有启动或关闭用户 GUI，没有进行真实界面点击，没有验证每个搜索提供商、付费搜索 API、模型自动选择工具、subagent 模型执行、视频/PDF 功能，也没有尝试触发安全漏洞。

## 上游资料

- [pi-web-access 0.34.0 更新日志](https://raw.githubusercontent.com/nicobailon/pi-web-access/v0.34.0/CHANGELOG.md)：升级 undici、抓取代理和工具激活变更。
- [npm audit 说明](https://docs.npmjs.com/cli/v11/commands/npm-audit/)：依赖安全审计、受影响包与修复行为。
- [undici BalancedPool advisory](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3)：仅特定网络调用路径受影响，8.10.2 修复。
- [brace-expansion 递归资源耗尽 advisory](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-qhr7-859c-m2p7)。
