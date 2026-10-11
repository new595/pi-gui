import { createJiti } from "file:///F:/GitHub-repository/pi-gui/node_modules/jiti/lib/jiti.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The host GUI has no Node-mode flag; remove the flag used to start this probe.
delete process.env.ELECTRON_RUN_AS_NODE;
const jiti = createJiti(import.meta.url);
const { PwshTaskRuntime } = await jiti.import(
  "C:/Users/lwj/.pi/agent/npm/node_modules/@4fu/pi-pwsh/src/task-runtime.ts",
);
const root = "F:/learn/Pi-GUI相关文档/pwsh-diagnosis/smoke-data";
await mkdir(root, { recursive: true });
const fixture = join(root, "fixture.txt");
await writeFile(fixture, "fixture-ok\n", "utf8");
const runtime = new PwshTaskRuntime({
  version: "7.6.5",
  executable: "C:/Users/lwj/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe",
  loadProfile: false,
  executionPolicy: "Bypass",
  stopOnError: true,
  pythonUtf8: true,
  pythonUnbuffered: true,
}, { taskDir: join(root, "tasks"), sessionId: "pi-pwsh-local-diagnostic" });

async function run(label, command, extraEnv = {}) {
  const task = await runtime.start(command, root, undefined, "", extraEnv);
  const result = await runtime.snapshot(task.id, 10);
  if (result.metadata.status !== "completed" || result.metadata.exitCode !== 0) {
    throw new Error(`${label}: ${result.metadata.status}: ${result.metadata.error ?? ""}`);
  }
  console.log(`${label}: ${JSON.stringify(result.output.trim())}`);
  return result.output.trim();
}

if ((await run("hello", "'hello'")) !== "hello") throw new Error("hello mismatch");
if ((await run("fixture", "Get-Content -LiteralPath './fixture.txt'")) !== "fixture-ok") {
  throw new Error("fixture mismatch");
}
if ((await run("env-unset", "if (Test-Path Env:ELECTRON_RUN_AS_NODE) { 'leaked' } else { 'clean' }")) !== "clean") {
  throw new Error("Electron flag leaked to PowerShell");
}
if ((await run("env-original", "$env:ELECTRON_RUN_AS_NODE", { ELECTRON_RUN_AS_NODE: "0" })) !== "0") {
  throw new Error("original Electron flag was not restored");
}
console.log("all smoke checks passed");
