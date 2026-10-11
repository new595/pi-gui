import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = 'C:/Users/lwj/.pi/agent/npm/node_modules/pi-subagents';
if (process.argv[2] === '--child') {
  const config = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
  const { runConfiguredSubagentExecution } = await import(pathToFileURL(path.join(pkg, 'src/runs/background/subagent-runner.js')).href);
  await runConfiguredSubagentExecution(config);
} else {
  if (!process.argv.includes('--live')) throw new Error('Explicit --live is required for the single real-provider smoke request.');
  const privateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-runner-proxy-private-'));
  const runDir = path.join(here, 'live-runs', new Date().toISOString().replaceAll(':', '-'));
  const agentDir = path.join(privateRoot, 'agent');
  const workspace = path.join(runDir, 'workspace');
  const asyncDir = path.join(runDir, 'async');
  const sessions = path.join(runDir, 'sessions');
  for (const dir of [agentDir, workspace, asyncDir, sessions]) await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const source = 'C:/Users/lwj/.pi/agent';
  const auth = JSON.parse(await fs.readFile(path.join(source, 'auth.json'), 'utf8'));
  if (!auth['openai-codex']) throw new Error('Selected provider credentials are unavailable.');
  await fs.writeFile(path.join(agentDir, 'auth.json'), JSON.stringify({ 'openai-codex': auth['openai-codex'] }), { mode: 0o600 });
  const originalSettings = JSON.parse(await fs.readFile(path.join(source, 'settings.json'), 'utf8'));
  if (typeof originalSettings.httpProxy !== 'string' || !originalSettings.httpProxy.trim()) throw new Error('The settings-only proxy regression requires an explicit configured proxy.');
  await fs.writeFile(path.join(agentDir, 'settings.json'), JSON.stringify({ httpProxy: originalSettings.httpProxy, packages: [], extensions: [], defaultProvider: 'openai-codex', defaultModel: 'gpt-6-luna' }), { mode: 0o600 });
  const config = {
    id: randomUUID(), sessionId: randomUUID(), cwd: workspace, placeholder: '{previous}', asyncDir,
    resultPath: path.join(runDir, 'result.json'), sessionDir: sessions,
    artifactsDir: path.join(runDir, 'artifacts'), timeoutMs: 90000,
    steps: [{ agent: 'proxy-smoke', task: 'Return exactly PROXY_OK. Do not use tools.',
      model: 'openai-codex/gpt-6-luna', thinking: 'low', tools: [], extensions: [],
      allowNestedSubagents: false, inheritProjectContext: false, inheritGlobalContext: false,
      inheritSkills: false, systemPrompt: 'This is a connection smoke check. Return PROXY_OK only.',
      systemPromptMode: 'replace', outputMode: 'inline', timeoutMs: 90000 }],
  };
  const configPath = path.join(runDir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
  for (const key of Object.keys(env)) {
    if (/proxy$/i.test(key) || /^(OPENAI|ANTHROPIC|GEMINI|GOOGLE|AZURE|DEEPSEEK).*?(KEY|TOKEN)$/i.test(key) || /^PI_SUBAGENTS_TEST_/.test(key)) delete env[key];
  }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child', configPath], { env, cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume();
  let diagnostic = '';
  child.stderr.on('data', (data) => { diagnostic += data.toString(); });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 110000);
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  clearTimeout(timer);
  let result;
  try { result = JSON.parse(await fs.readFile(config.resultPath, 'utf8')); } catch {}
  const summary = { runDir, privateAuthDirectory: privateRoot, pid: child.pid, exit, timedOut,
    settingsOnlyProxy: true, realProvider: 'openai-codex/gpt-6-luna',
    resultAvailable: Boolean(result), containsMarker: result?.success === true && result?.exitCode === 0 && Array.isArray(result?.results) && result.results.length === 1 && result.results[0].success === true && result.results[0].output?.trim() === 'PROXY_OK',
    stepResults: result?.results?.map(({ success, error, output, model }) => ({ success, error, output, model })),
    networkFailureInDiagnostics: /fetch failed|WebSocket error/i.test(diagnostic),
    scope: 'Independent process invokes the actual installed background execution entry; launcher/UI handshake is not exercised.' };
  await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (exit.code !== 0 || timedOut || !summary.containsMarker) process.exitCode = 1;
}
