import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = 'F:/GitHub-repository/pi-gui';
const exe = 'F:/Apps/pi-gui-proxy/versions/1.0.1-proxy.4/pi-gui.exe';
const extensionEntry = 'C:/Users/lwj/.pi/agent/npm/node_modules/pi-subagents/index.js';
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const runDir = join(here, 'runs', runId);
const userDataDir = join(runDir, 'user-data');
const agentDir = join(runDir, 'agent');
const workspace = join(runDir, 'workspace');
await Promise.all([mkdir(userDataDir, { recursive: true }), mkdir(agentDir, { recursive: true }), mkdir(workspace, { recursive: true })]);
await writeFile(join(agentDir, 'settings.json'), `${JSON.stringify({ extensions: [extensionEntry] }, null, 2)}\n`, 'utf8');

const helperPath = join(repo, 'apps/desktop/tests/helpers/electron-app.ts');
const { launchDesktopByExecutable } = await import(pathToFileURL(helperPath).href);
const evidence = {
  runId, executable: exe, extensionEntry, userDataDir, agentDir, workspace,
  testMode: 'unset', inheritedEnvironment: false, realAuth: 'unset', modelSubmission: false,
};
let harness;
try {
  harness = await launchDesktopByExecutable(exe, userDataDir, {
    initialWorkspaces: [workspace],
    agentDir,
    inheritParentEnv: false,
    envOverrides: {
      PI_APP_TEST_MODE: undefined,
      PI_APP_TEST_LANE: undefined,
      PI_APP_REAL_AUTH: undefined,
      PI_APP_REAL_AUTH_SOURCE_DIR: undefined,
      PI_APP_OPEN_DEVTOOLS: '0',
    },
  });
  const page = await harness.firstWindow();
  const doctor = await harness.electronApp.evaluate(({ app, BrowserWindow }) => ({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    executable: process.execPath,
    pid: process.pid,
    userData: app.getPath('userData'),
    envUserData: process.env.PI_APP_USER_DATA_DIR ?? null,
    envAgentDir: process.env.PI_CODING_AGENT_DIR ?? null,
    testMode: process.env.PI_APP_TEST_MODE ?? null,
    testLane: process.env.PI_APP_TEST_LANE ?? null,
    realAuth: process.env.PI_APP_REAL_AUTH ?? null,
    hasTestHooks: Boolean((globalThis as any).__PI_APP_TEST__ || (globalThis as any).piAppTest),
    windowVisible: BrowserWindow.getAllWindows()[0]?.isVisible() ?? false,
    windowFocused: BrowserWindow.getAllWindows()[0]?.isFocused() ?? false,
  }));
  evidence.doctor = doctor;
  await page.screenshot({ path: join(runDir, 'launch.png'), animations: 'disabled' });
  if (!doctor.isPackaged || resolve(doctor.executable).toLowerCase() !== resolve(exe).toLowerCase()) {
    throw new Error('Doctor failed: process is not the requested packaged executable.');
  }
  if (resolve(doctor.userData).toLowerCase() !== resolve(userDataDir).toLowerCase()) {
    throw new Error('Doctor failed: app userData is not isolated under the evidence directory.');
  }
  if (doctor.testMode !== null || doctor.testLane !== null || doctor.realAuth !== null) {
    throw new Error('Doctor failed: test mode/lane or real-auth opt-in is present.');
  }

  const newThreadButton = page.locator('.sidebar').getByRole('button', { name: 'New thread', exact: true });
  await newThreadButton.waitFor({ state: 'visible', timeout: 15_000 });
  await newThreadButton.click();
  const composer = page.getByTestId('new-thread-composer');
  await composer.waitFor({ state: 'visible', timeout: 20_000 });
  await composer.fill('/subagents-models');
  const slashMenu = page.getByTestId('slash-menu');
  await slashMenu.waitFor({ state: 'visible', timeout: 10_000 });
  const suggestions = await slashMenu.innerText();
  evidence.slashSuggestions = suggestions;
  await page.screenshot({ path: join(runDir, 'slash-command-discovery.png'), animations: 'disabled' });
  if (!suggestions.includes('subagents-models')) {
    evidence.outcome = 'not-registered';
    throw new Error('Slash command was not present in the visible suggestions; command was not submitted.');
  }

  const timeline = page.locator('.timeline');
  const beforeTimeline = await timeline.innerText().catch(() => '');
  await composer.fill('/subagents-models scout');
  await composer.press('Enter');
  await page.waitForFunction(() => {
    const text = document.querySelector('.timeline')?.textContent ?? '';
    return text.includes('Subagent model') || text.includes('No subagent named');
  }, undefined, { timeout: 20_000 });
  await page.screenshot({ path: join(runDir, 'subagents-models-result.png'), animations: 'disabled' });
  const afterTimeline = await timeline.innerText().catch(() => '');
  const output = afterTimeline.slice(beforeTimeline.length);
  evidence.outcome = 'command-submitted';
  evidence.resultOutput = output;
  evidence.outputIsModelsResult = /Subagent model[\s\S]*Agent:\s*scout[\s\S]*Effective model:[\s\S]*Source:[\s\S]*Thinking:/i.test(output);
  evidence.agentWasNotFound = /No subagent named/i.test(output);
  if (!evidence.outputIsModelsResult && !evidence.agentWasNotFound) {
    throw new Error('Command was recognized but the UI did not show a subagents model result.');
  }
} catch (error) {
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  throw error;
} finally {
  if (harness) {
    await harness.close();
    evidence.ownedProcessClosed = true;
  }
  await writeFile(join(runDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ runDir, evidence }, null, 2));
}
