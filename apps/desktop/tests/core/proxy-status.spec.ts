import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  desktopShortcut,
  launchDesktop,
  launchDesktopByExecutable,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

const PACKAGED = process.env.PI_PROXY_PACKAGED === "1";
const PACKAGED_EXECUTABLE =
  process.env.PI_PROXY_EXECUTABLE ?? resolve("apps/desktop/release/win-unpacked/pi-gui.exe");

test(`General renders the real startup proxy snapshot without exposing credentials (${PACKAGED ? "packaged" : "dev"})`, async () => {
  const expectedLabel = (
    JSON.parse(await readFile(resolve("apps/desktop/personal-build.json"), "utf8")) as {
      readonly label: string;
    }
  ).label;
  const explicit = await showGeneralForSnapshot({
    name: "proxy-status-pi-settings",
    settings: { httpProxy: "http://synthetic-user:synthetic-password@proxy.example:3128" },
    envOverrides: {
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      http_proxy: undefined,
      https_proxy: undefined,
      NO_PROXY: "localhost,127.0.0.1,.example.test",
      no_proxy: undefined,
    },
  });
  try {
    const section = explicit.section;
    expect(explicit.identity.isPackaged).toBe(PACKAGED);
    if (PACKAGED) {
      expect(resolve(explicit.identity.appPath)).toBe(
        resolve(dirname(PACKAGED_EXECUTABLE), "resources", "app.asar"),
      );
    } else {
      expect(resolve(explicit.identity.appPath)).toBe(resolve("apps/desktop"));
    }
    const snapshot = await explicit.window.evaluate(() => window.piApp?.getProxyStatus());
    expect(snapshot).toMatchObject({
      source: "pi-settings",
      httpProxy: "http://proxy.example:3128",
      httpsProxy: "http://proxy.example:3128",
      noProxy: "localhost,127.0.0.1,.example.test",
    });
    await expect(section).toContainText("Pi settings");
    await expect(section).toContainText("http://proxy.example:3128");
    await expect(section).toContainText("localhost,127.0.0.1,.example.test");
    await expect(section).not.toContainText("synthetic-user");
    await expect(section).not.toContainText("synthetic-password");
    await expect(section).not.toContainText(explicit.settingsPath);
    await expect(section).toContainText(expectedLabel);
    await expect(section.getByText(/^\d+\.\d+\.\d+/)).toBeVisible();
    await expect(section).toContainText("quit and restart");
    const screenshotPath = test
      .info()
      .outputPath(`proxy-status-general-${PACKAGED ? "packaged" : "final"}.png`);
    await mkdir(dirname(screenshotPath), { recursive: true });
    await explicit.window.screenshot({ path: screenshotPath, fullPage: false });

    // The screen refreshes the startup snapshot; edits made after launch do not
    // hot-apply to the active process or alter the snapshot shown here.
    await writeFile(
      explicit.settingsPath,
      `${JSON.stringify({ httpProxy: "http://changed.example:9000" })}\n`,
      "utf8",
    );
    await section.getByRole("button", { name: "Refresh status" }).click();
    await expect(section).toContainText("http://proxy.example:3128");
    await expect(section).not.toContainText("changed.example");

    await explicit.harness.electronApp.evaluate(({ shell }) => {
      shell.openPath = async (filePath) => {
        (
          globalThis as typeof globalThis & { __proxySettingsOpenedPath?: string }
        ).__proxySettingsOpenedPath = filePath;
        return "";
      };
    });
    await section.getByRole("button", { name: "Open Pi settings" }).click();
    await expect(section.getByRole("alert")).toHaveCount(0);
    await expect
      .poll(() =>
        explicit.harness.electronApp.evaluate(
          () =>
            (globalThis as typeof globalThis & { __proxySettingsOpenedPath?: string })
              .__proxySettingsOpenedPath,
        ),
      )
      .toBe(explicit.settingsPath);
  } finally {
    await explicit.harness.close();
  }

  const environment = await showGeneralForSnapshot({
    name: "proxy-status-environment",
    settings: {},
    envOverrides: {
      HTTP_PROXY: "http://env-user:env-password@env-proxy.example:8080",
      HTTPS_PROXY: "https://env-secure-user:env-secure-password@env-proxy.example:8443",
      NO_PROXY: "internal.example",
      http_proxy: undefined,
      https_proxy: undefined,
      no_proxy: undefined,
    },
  });
  try {
    await expect(environment.section).toContainText("Environment variables");
    await expect(environment.section).toContainText("http://env-proxy.example:8080");
    await expect(environment.section).toContainText("https://env-proxy.example:8443");
    await expect(environment.section).toContainText("internal.example");
    await expect(environment.section).not.toContainText("env-password");
  } finally {
    await environment.harness.close();
  }

  const direct = await showGeneralForSnapshot({
    name: "proxy-status-direct",
    settings: {},
    envOverrides: {
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      http_proxy: undefined,
      https_proxy: undefined,
      NO_PROXY: "",
      no_proxy: undefined,
    },
  });
  try {
    await expect(direct.section).toContainText("Direct connection");
    await expect(direct.section.getByText("Not set")).toBeVisible();
  } finally {
    await direct.harness.close();
  }
});

async function showGeneralForSnapshot(input: {
  readonly name: string;
  readonly settings: Record<string, unknown>;
  readonly envOverrides: Record<string, string | undefined>;
}) {
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const settingsPath = join(agentDir, "settings.json");
  const workspacePath = await makeWorkspace(input.name);
  await seedAgentDir(agentDir, { enabledModels: [] });
  await writeFile(settingsPath, `${JSON.stringify(input.settings, null, 2)}\n`, "utf8");
  const launchOptions = {
    agentDir,
    initialWorkspaces: [workspacePath],
    scrubProviderEnv: true,
    testMode: "foreground",
    envOverrides: input.envOverrides,
  } as const;
  const harness = PACKAGED
    ? await launchDesktopByExecutable(PACKAGED_EXECUTABLE, userDataDir, launchOptions)
    : await launchDesktop(userDataDir, launchOptions);
  const identity = await harness.electronApp.evaluate(({ app }) => ({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
  }));
  const window = await harness.firstWindow();
  await waitForWorkspaceByPath(window, workspacePath);
  await window.keyboard.press(desktopShortcut(","));
  await expect(window.getByTestId("settings-surface")).toBeVisible();
  await window.getByRole("button", { name: "General", exact: true }).click();
  const section = window.locator(".settings-section", {
    has: window.locator(".settings-section__title", { hasText: "Pi and proxy" }),
  });
  await expect(section.getByRole("button", { name: "Refresh status" })).toBeVisible();
  return { harness, section, settingsPath, window, identity };
}
