import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = 'F:/GitHub-repository/pi-gui';
const exe = 'F:/Apps/pi-gui-proxy/versions/1.0.1-proxy.4/pi-gui.exe';
const extensionEntry = 'C:/Users/lwj/.pi/agent/npm/node_modules/pi-subagents/index.js';
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const runDir = process.env.PI_GUI_RUN_DIR?.trim() || join(here, 'runs', runId);
const userDataDir = join(runDir, 'user-data');
const agentDir = join(runDir, 'agent');
const workspace = join(runDir, 'workspace');
await Promise.all([mkdir(userDataDir, { recursive: true }), mkdir(agentDir, { recursive: true }), mkdir(workspace, { recursive: true })]);
await writeFile(join(agentDir, 'settings.json'), `${JSON.stringify({ packages: ['C:/Users/lwj/.pi/agent/npm/node_modules/pi-subagents', 'C:/Users/lwj/.pi/agent/npm/node_modules/@4fu/pi-pwsh', 'C:/Users/lwj/.pi/agent/npm/node_modules/@juicesharp/rpiv-ask-user-question', 'C:/Users/lwj/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo', 'C:/Users/lwj/.pi/agent/npm/node_modules/pi-web-access'] }, null, 2)}\n`, 'utf8');

await writeFile(join(agentDir,'models.json'),JSON.stringify({providers:{'offline-validation':{baseUrl:'http://127.0.0.1:9/v1',apiKey:'offline-test-not-a-secret',api:'openai-completions',models:[{id:'offline',name:'Offline validation',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:1024}]}}}));
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

  const initial = await page.evaluate(() => window.piApp.getState());
  await writeFile(join(runDir,'initial-state.json'),JSON.stringify(initial,null,2));
  const wsId = initial.selectedWorkspaceId || initial.workspaces[0]?.id;
  if (!wsId) throw new Error('No isolated workspace');
  await page.evaluate((id) => window.piApp.refreshRuntime(id),wsId);
  await page.getByRole('button',{name:'Extensions',exact:true}).click();
  await writeFile(join(runDir,'extensions.txt'),await page.locator('body').innerText());
  await page.screenshot({path:join(runDir,'extensions.png')});
  await page.evaluate((id) => window.piApp.setDefaultModel(id,'offline-validation','offline'),wsId);
  await page.evaluate((id) => window.piApp.createSession({workspaceId:id,title:'Extension verification'}),wsId);
  const state = await page.evaluate(() => window.piApp.getState());
  await writeFile(join(runDir,'session-state.json'),JSON.stringify(state,null,2));
  await page.evaluate(() => window.piApp.setActiveView('threads'));
  const composer = page.getByTestId('composer');
  await composer.fill('/subagents-models');
  await page.screenshot({path:join(runDir,'slash.png')});
  await writeFile(join(runDir,'slash.txt'),await page.locator('body').innerText());
  const menu=page.getByTestId('slash-menu');
  await menu.waitFor({state:'visible',timeout:5000});
  evidence.slashSuggestions=await menu.innerText();
  if(!evidence.slashSuggestions.includes('subagents-models')) throw new Error('Not registered');
  await composer.fill('/subagents-models scout');
  await composer.press('Enter');
  const dock = page.getByTestId('extension-dock');
  await dock.waitFor({state:'visible',timeout:15000});
  evidence.widgetSummary=await page.getByTestId('extension-dock-summary').innerText();
  await page.getByTestId('extension-dock-toggle').click();
  const widgetBody = page.getByTestId('extension-dock-body');
  await widgetBody.waitFor({state:'visible',timeout:5000});
  evidence.resultOutput=await widgetBody.innerText();
  evidence.outputIsModelsResult=/Agent:\s*scout[\s\S]*Effective model:[\s\S]*Source:[\s\S]*Thinking:/i.test(evidence.resultOutput);
  if(!evidence.outputIsModelsResult) throw new Error('Widget rendered, but its expanded content did not contain the expected model mapping fields.');
  await page.screenshot({path:join(runDir,'result.png')});
  evidence.outcome='models-result-displayed';} catch (error) {
  if(harness) { const p=await harness.firstWindow(); await writeFile(join(runDir,'failure.txt'),await p.locator('body').innerText()); await p.screenshot({path:join(runDir,'failure.png')}); }
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


