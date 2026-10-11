> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Background runner proxy verification

Run with the installed Node binary after `pi-subagents/src/runs/background/runner-http-dispatcher.js` is updated:

```powershell
& 'F:\software\Node.js\node.exe' '.\subagents-diagnosis\background-proxy-repair\verification\verify-background-proxy.mjs'
```

This is a runtime integration check. It starts a loopback-only CONNECT proxy and HTTP/SSE/WebSocket endpoints, then starts isolated Node child processes that load the installed dispatcher directly. Child processes have HTTP(S)_PROXY/ALL_PROXY environment variables removed. It checks that `settings.httpProxy` carries HTTP, SSE, and global WebSocket traffic through CONNECT, `NO_PROXY=127.0.0.1` bypasses the proxy, and an unreachable explicitly configured proxy fails without a direct request. No model API, credentials, auth files, or external network are used.
