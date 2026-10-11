> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Background runner proxy repair

## Installed change

Installed `runner-http-dispatcher.js` into the local `pi-subagents` 0.73.1 package at `C:\Users\lwj\.pi\agent\npm\node_modules\pi-subagents\src\runs\background\runner-http-dispatcher.js`. The untouched preimage is `runner-http-dispatcher.before.js` in this directory.

The detached runner now reads the global Pi `settings.json` from its own `agentDir`. A valid, nonblank `httpProxy` configures both HTTP and HTTPS requests, matching `desktop-proxy.ts`. A missing or blank value falls back to `HTTP_PROXY` and `HTTPS_PROXY`; `NO_PROXY` is retained. Conventional uppercase environment names take precedence over lowercase names. Both proxy URLs are validated before the Undici dispatcher is installed. Invalid explicit settings, invalid environment proxy URLs, settings read/parse errors, or dispatcher construction errors stop runner startup rather than allowing a direct request. Error messages do not include proxy URLs, which may contain credentials.

The existing `httpIdleTimeoutMs` resolution and `proxyTunnel: true` behavior remain. `undici.install()` routes Node's global WebSocket through the installed dispatcher. In the detached Bun runner only, the resolved proxy and bypass values are copied to the runner process's proxy environment variables for native WebSocket compatibility; ambient `ALL_PROXY` is cleared there so it cannot override the resolved policy. This mutation is confined to the runner process.

## Verification

- `node --check` succeeded for both the candidate and installed JavaScript file.
- The candidate was copied to the installed path without changes; SHA-256 comparison was performed after installation.
- Local HTTP, SSE, WebSocket, `NO_PROXY`, and failure-closed integration checks are owned by the separate verification step. Record their observed result here when complete.
- The real Luna background runner smoke check is owned by the parent task. It is a separate check that uses the actual runner entrypoint and provider; record its observed result separately.

## Scope and limitations

The change touches only the detached runner dispatcher. It does not change the GUI proxy implementation or other installed subagent patches. Bun's native WebSocket environment normalization has not been exercised in a Bun runner in this task; the Node integration check covers Undici's global WebSocket path.
