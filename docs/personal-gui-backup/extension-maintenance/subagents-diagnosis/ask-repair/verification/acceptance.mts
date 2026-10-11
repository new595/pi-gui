import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = "F:/GitHub-repository/pi-gui";
const exe = "F:/Apps/pi-gui-proxy/versions/1.0.1-proxy.4/pi-gui.exe";
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const runDir = join(here, "runs", runId);
const userDataDir = join(runDir, "user-data");
const agentDir = join(runDir, "agent");
const workspace = join(runDir, "workspace");
const resultDir = join(runDir, "results");
await Promise.all([userDataDir, agentDir, workspace, resultDir].map((path) => mkdir(path, { recursive: true })));
await writeFile(join(agentDir, "settings.json"), `${JSON.stringify({ packages: [join(here, "fixture")] }, null, 2)}\n`, "utf8");
await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { "offline-validation": { baseUrl: "http://127.0.0.1:9/v1", apiKey: "offline-test-not-a-secret", api: "openai-completions", models: [{ id: "offline", name: "Offline validation", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 }] } } }));

const { launchDesktopByExecutable } = await import(pathToFileURL(join(repo, "apps/desktop/tests/helpers/electron-app.ts")).href);
const evidence: Record<string, unknown> = {
  runId, executable: exe, userDataDir, agentDir, workspace, modelSubmission: false,
  cases: [],
};
let harness: any;
let watchdog: ReturnType<typeof setTimeout> | undefined;

async function waitForFile(name: string) {
  const path = join(resultDir, `${name}.json`);
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(path, "utf8")); } catch { await new Promise((resolve) => setTimeout(resolve, 80)); }
  }
  throw new Error(`Timed out waiting for real tool result ${name}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function invoke(page: any, name: string, interact: (dialog: any, page: any) => Promise<void>) {
  await page.evaluate((command: string) => { void window.piApp.submitComposer(command).catch(() => {}); }, `/verify-ask-${name.toLowerCase()}`);
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 15_000 });
  await page.screenshot({ path: join(runDir, `${name}-dialog.png`), animations: "disabled" });
  await interact(dialog, page);
  const result = await waitForFile(name);
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
  assert(result && !result.error, `${name}: tool failed: ${JSON.stringify(result)}`);
  evidence.cases && (evidence.cases as unknown[]).push({ name, result });
  return result;
}

async function choose(dialog: any, visibleLabel: RegExp) {
  await dialog.getByRole("button", { name: visibleLabel }).click();
}

try {
  harness = await launchDesktopByExecutable(exe, userDataDir, {
    initialWorkspaces: [workspace], agentDir, inheritParentEnv: false,
    envOverrides: { PI_EXT_VERIFY_DIR: resultDir, PI_APP_TEST_MODE: undefined, PI_APP_TEST_LANE: undefined, PI_APP_REAL_AUTH: undefined, PI_APP_REAL_AUTH_SOURCE_DIR: undefined, PI_APP_OPEN_DEVTOOLS: "0" },
  });
  evidence.electronPid = harness.electronApp.process().pid;
  watchdog = setTimeout(() => { void harness?.close(); }, 150_000);
  const page = await harness.firstWindow();
  const doctor = await harness.electronApp.evaluate(({ app }: any) => ({ packaged: app.isPackaged, executable: process.execPath, userData: app.getPath("userData"), agentDir: process.env.PI_CODING_AGENT_DIR ?? null, testMode: process.env.PI_APP_TEST_MODE ?? null }));
  evidence.doctor = doctor;
  if (!doctor.packaged || resolve(doctor.executable).toLowerCase() !== resolve(exe).toLowerCase()) throw new Error("Wrong executable");
  if (resolve(doctor.userData).toLowerCase() !== resolve(userDataDir).toLowerCase()) throw new Error("Nonisolated userData");
  if (doctor.testMode !== null) throw new Error("Unexpected test mode");

  const initial = await page.evaluate(() => window.piApp.getState());
  const workspaceId = initial.selectedWorkspaceId || initial.workspaces[0]?.id;
  if (!workspaceId) throw new Error("No isolated workspace");
  await page.evaluate((id: string) => window.piApp.refreshRuntime(id), workspaceId);
  await page.evaluate((id: string) => window.piApp.setDefaultModel(id, "offline-validation", "offline"), workspaceId);
  await page.evaluate((id: string) => window.piApp.createSession({ workspaceId: id, title: "ask_user_question GUI verification" }), workspaceId);
  const state = await page.evaluate(() => window.piApp.getState());
  const registered = Object.values(state.sessionCommandsBySession ?? {}).some((commands: any) => Array.isArray(commands) && commands.some((command: any) => command.name === "verify-ask-single"));
  assert(registered, "Real fixture factory slash commands were not registered in the actual runtime");

  const single = await invoke(page, "single", async (dialog) => choose(dialog, /Beta/));
  assert(single.result?.details?.cancelled === false && single.result?.details?.answers?.[0]?.answer === "Beta", `single select failed: ${JSON.stringify(single)}`);

  const custom = await invoke(page, "custom", async (dialog) => {
    await choose(dialog, /Type something/i);
    const inputDialog = page.getByRole("dialog");
    await inputDialog.getByRole("textbox").fill("typed GUI answer");
    await inputDialog.getByTestId("extension-dialog-submit").click();
  });
  assert(custom.result?.details?.cancelled === false && custom.result?.details?.answers?.[0]?.kind === "custom" && custom.result?.details?.answers?.[0]?.answer === "typed GUI answer", `custom answer failed: ${JSON.stringify(custom)}`);

  const multi = await invoke(page, "multi", async (dialog) => {
    const input = dialog.getByRole("textbox");
    await input.fill("1,3");
    await dialog.getByTestId("extension-dialog-submit").click();
  });
  assert(multi.result?.details?.cancelled === false && JSON.stringify(multi.result?.details?.answers?.[0]?.selected) === JSON.stringify(["One", "Three"]), `multi 1,3 failed: ${JSON.stringify(multi)}`);

  const cancelled = await invoke(page, "cancel", async (dialog) => dialog.getByTestId("extension-dialog-cancel").click());
  assert(cancelled.result?.details?.cancelled === true && cancelled.result?.details?.answers?.length === 0, `cancel was not reported: ${JSON.stringify(cancelled)}`);

  const seqA = await invoke(page, "sequencea", async (dialog) => choose(dialog, /A2/));
  assert(seqA.result?.details?.cancelled === false && seqA.result?.details?.answers?.[0]?.answer === "A2", `first sequential invocation failed: ${JSON.stringify(seqA)}`);
  const seqB = await invoke(page, "sequenceb", async (dialog) => choose(dialog, /B1/));
  assert(seqB.result?.details?.cancelled === false && seqB.result?.details?.answers?.[0]?.answer === "B1", `second sequential invocation failed: ${JSON.stringify(seqB)}`);

  const twoQuestionCancel = await invoke(page, "secondcancel", async (dialog) => {
    await choose(dialog, /Keep/);
    const secondDialog = page.getByRole("dialog");
    await secondDialog.waitFor({ state: "visible", timeout: 10_000 });
    await secondDialog.getByTestId("extension-dialog-cancel").click();
  });
  const twoQuestionJSON = JSON.stringify(twoQuestionCancel.result);
  assert(twoQuestionCancel.result?.details?.cancelled === true && twoQuestionCancel.result?.details?.answers?.length === 1 && twoQuestionCancel.result?.details?.answers?.[0]?.answer === "Keep", `second-question cancel lost prior answer or cancellation: ${twoQuestionJSON}`);

  await page.screenshot({ path: join(runDir, "completed.png"), animations: "disabled" });
  evidence.outcome = "all-real-gui-cases-passed";
} catch (error) {
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  throw error;
} finally {
  if (watchdog) clearTimeout(watchdog);
  if (harness) { await harness.close(); evidence.ownedProcessClosed = true; }
  await writeFile(join(runDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ runDir, evidence }, null, 2));
}
