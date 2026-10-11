> 归档说明：本文件保存截至 2026-10-11 的历史资料。用户已决定暂时卸载 GUI；当前状态与恢复步骤以备份根目录 README.md 和 RESTORE.md 为准。报告引用的本地运行日志、截图、认证或会话未随此归档上传。

# Background proxy repair verification report

Date: 2026-09-28 (Asia/Shanghai)

## Result

The installed `runner-http-dispatcher.js` passed the local Node integration harness. The harness used isolated child processes with HTTP(S)/ALL proxy environment variables cleared and exercised the installed dispatcher directly.

- `settings.httpProxy`: HTTP (`/http`), SSE (`/events`), and global WebSocket (`/socket`) all reached the local origin through the local CONNECT proxy. The proxy observed all three request paths inside two tunnels, allowing connection reuse.
- `NO_PROXY=127.0.0.1`: `/direct` reached the origin directly; the proxy recorded no additional tunnel or tunneled request.
- Unreachable explicit `httpProxy`: the child request failed, and the origin recorded zero requests, confirming there was no direct fallback.
- Node syntax check: passed.
- Integration process exit code: 0, using `F:\software\Node.js\node.exe` v24.15.0.

The harness was corrected to use an HTTP CONNECT server, import the Windows dispatcher path as a `file:` URL, pass the correct child argv, and write the failing proxy setting before dispatcher installation. It records actual tunneled request paths so a partial proxy bypass cannot pass. Test settings were retained at `C:\Users\lwj\AppData\Local\Temp\pi-subagents-proxy-verify-LnpdQD` for inspection.

## Boundaries

No external provider, credential, or authenticated request was used. Bun was not tested; results apply to the Node runtime above.


## Real provider verification — 2026-09-28

An isolated Node child invoked the installed runConfiguredSubagentExecution entry with proxy environment variables removed and only settings.httpProxy configured. The real openai-codex/gpt-6-luna returned exactly PROXY_OK. Retained result: ../live-runs/2026-09-28T15-56-17.445Z/result.json; success=true, state=complete, exitCode=0. Provider execution duration was 3736 ms, 189 input / 7 output tokens. No WebSocket error or fetch failed was observed in child diagnostics.

Harness corrections: the first live request also returned PROXY_OK but could not publish its result because synthetic config omitted sessionId. The second request published successfully; its initial evaluator incorrectly expected per-step exitCode. The evaluator was corrected to use top-level exitCode and per-step success, and retained result was re-evaluated without another provider request. Both raw runs are retained. Two minimal provider calls total.

Scope: actual installed background execution entry and network stack; not the GUI submission/bootstrap handshake. Bun remains untested. No user GUI process was stopped. Private selected-provider auth copies are outside this evidence directory in OS temp, not included in repository or reports.
