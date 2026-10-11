import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = 'F:/GitHub-repository/pi-gui';
const exe = 'F:/Apps/pi-gui-proxy/versions/1.0.1-proxy.4/pi-gui.exe';
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const runDir = join(here, 'runs', runId);
const userDataDir = join(runDir, 'user-data');
const agentDir = join(runDir, 'agent');
const workspace = join(runDir, 'workspace');
const resultDir = join(runDir, 'results');
await Promise.all([userDataDir, agentDir, workspace, resultDir].map((p) => mkdir(p, { recursive: true })));
await writeFile(join(agentDir, 'settings.json'), `${JSON.stringify({ packages: [join(here, 'fixture')] }, null, 2)}\n`, 'utf8');
await writeFile(join(agentDir, 'models.json'), JSON.stringify({ providers: { 'offline-validation': { baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'offline-test-not-a-secret', api: 'openai-completions', models: [{ id: 'offline', name: 'Offline validation', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 }] } } }));

const { launchDesktopByExecutable } = await import(pathToFileURL(join(repo, 'apps/desktop/tests/helpers/electron-app.ts')).href);
const evidence: Record<string, unknown> = { runId, executable: exe, userDataDir, agentDir, workspace, modelSubmission: false, tests: {} };
let harness;
try {
  harness = await launchDesktopByExecutable(exe, userDataDir, {
    initialWorkspaces: [workspace], agentDir, inheritParentEnv: false,
    envOverrides: { PI_EXT_VERIFY_DIR: resultDir, PI_APP_TEST_MODE: undefined, PI_APP_TEST_LANE: undefined, PI_APP_REAL_AUTH: undefined, PI_APP_REAL_AUTH_SOURCE_DIR: undefined, PI_APP_OPEN_DEVTOOLS: '0' },
  });
  const page = await harness.firstWindow();
  const doctor = await harness.electronApp.evaluate(({ app }) => ({ packaged: app.isPackaged, executable: process.execPath, userData: app.getPath('userData'), agentDir: process.env.PI_CODING_AGENT_DIR ?? null, testMode: process.env.PI_APP_TEST_MODE ?? null }));
  evidence.doctor = doctor;
  if (!doctor.packaged || resolve(doctor.executable).toLowerCase() !== resolve(exe).toLowerCase()) throw new Error('Wrong executable');
  if (resolve(doctor.userData).toLowerCase() !== resolve(userDataDir).toLowerCase()) throw new Error('Nonisolated userData');
  if (doctor.testMode !== null) throw new Error('Unexpected test mode');
  const initial = await page.evaluate(() => window.piApp.getState());
  const workspaceId = initial.selectedWorkspaceId || initial.workspaces[0]?.id;
  if (!workspaceId) throw new Error('No isolated workspace');
  await page.evaluate((id) => window.piApp.refreshRuntime(id), workspaceId);
  await page.evaluate((id) => window.piApp.setDefaultModel(id, 'offline-validation', 'offline'), workspaceId);
  await page.evaluate((id) => window.piApp.createSession({ workspaceId: id, title: 'Other extension verification' }), workspaceId);
  const state = await page.evaluate(() => window.piApp.getState());
  evidence.fixtureRegistered = state.sessionCommandsBySession && Object.values(state.sessionCommandsBySession).some((commands: any) => Array.isArray(commands) && commands.some((command) => command.name === 'verify-pwsh'));
  if (!evidence.fixtureRegistered) throw new Error('Verification fixture commands not registered');
  const tests = evidence.tests as Record<string, unknown>;
  for (const name of ['pwsh', 'todo', 'ask', 'web']) {
    await page.evaluate((command) => window.piApp.submitComposer(command), `/verify-${name}`);
    const raw = await readFile(join(resultDir, `${name}.json`), 'utf8');
    tests[name] = JSON.parse(raw);
  }
  await page.screenshot({ path: join(runDir, 'completed.png'), animations: 'disabled' });
  evidence.outcome = 'all-fixtures-executed';
} catch (error) {
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  throw error;
} finally {
  if (harness) { await harness.close(); evidence.ownedProcessClosed = true; }
  await writeFile(join(runDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ runDir, evidence }, null, 2));
}
