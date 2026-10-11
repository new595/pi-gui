# 源码补丁

源码恢复优先 clone 本仓库 proxy-support 分支；这些 patch 是额外的重放资料，不需要再次应用到已经包含改动的个人分支。

- proxy-patches：第一阶段代理支持及验证。
- proxy-patches-phase2：个人版本标识、状态与历史启动器。
- proxy-patches-phase3：界面缩放。
- [proxy-patches-v1.0.1](./proxy-patches-v1.0.1/README.md)：相对官方 v1.0.1 的累计源码修改。

各阶段的旧启动器说明是历史记录，当前入口保存在 ../launcher。累计 patch 必须先检出干净的官方 v1.0.1 基线 dd5708fb61a38b5012d0ab149b62054d02c1c72f，再 git apply --check；后续上游版本应重新适配。
