import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  desktopShortcut,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
} from "../helpers/electron-app";
import { listenLoopback, startLocalConnectProxy } from "../helpers/proxy-fixture";

test("custom endpoint Detect models reaches its local HTTP server through the configured proxy", async () => {
  const origin = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "proxy-detected-model" }] }));
  });
  const baseUrl = `${await listenLoopback(origin)}/v1`;
  const proxy = await startLocalConnectProxy();
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("proxy-model-detection-workspace");
  await seedAgentDir(agentDir, { enabledModels: [] });
  await writeFile(
    join(agentDir, "settings.json"),
    `${JSON.stringify({ httpProxy: proxy.url }, null, 2)}\n`,
    "utf8",
  );
  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    scrubProviderEnv: true,
    testMode: "background",
    envOverrides: {
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      NO_PROXY: "",
      no_proxy: "",
    },
  });
  try {
    const window = await harness.firstWindow();
    await window.keyboard.press(desktopShortcut(","));
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await window.getByRole("button", { name: "Providers", exact: true }).click();
    const customEndpoints = window.locator(".settings-section", {
      has: window.locator(".settings-section__title", { hasText: "Custom endpoints" }),
    });
    await customEndpoints.getByRole("button", { name: "Add endpoint", exact: true }).click();
    const dialog = window.getByTestId("custom-endpoint-dialog");
    await dialog.getByLabel("Provider ID").fill("proxy-test");
    await dialog.getByLabel("Base URL").fill(baseUrl);
    await dialog.getByLabel("API key").fill("fixture-key");
    await dialog.getByRole("button", { name: "Detect models", exact: true }).click();
    await expect(dialog.locator(".custom-endpoint-model-list")).toContainText(
      "proxy-detected-model",
    );
    expect(proxy.tunnels()).toBeGreaterThan(0);
  } finally {
    await harness.close();
    await proxy.close();
    await new Promise<void>((resolve) => origin.close(() => resolve()));
  }
});
