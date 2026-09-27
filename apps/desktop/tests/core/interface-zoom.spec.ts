import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createNamedThread,
  desktopShortcut,
  getDesktopState,
  launchDesktop,
  launchDesktopByExecutable,
  makeUserDataDir,
  makeWorkspace,
  seedTranscriptMessages,
  waitForWorkspaceByPath,
  type DesktopHarness,
} from "../helpers/electron-app";

const zoomLevels = [90, 100, 110, 125, 150] as const;
const packagedExecutable = process.env.PI_PROXY_EXECUTABLE?.trim();

async function launchZoomApp(userDataDir: string, workspacePath: string) {
  const options = {
    initialWorkspaces: [workspacePath],
    testMode: "foreground" as const,
  };
  return packagedExecutable
    ? launchDesktopByExecutable(packagedExecutable, userDataDir, options)
    : launchDesktop(userDataDir, options);
}

async function setWindowSize(harness: DesktopHarness, window: Page): Promise<void> {
  const marker = `interface-zoom-${Date.now()}-${Math.random()}`;
  await window.evaluate((value) => {
    Object.assign(globalThis.window, { __interfaceZoomWindowMarker: value });
  }, marker);
  await harness.electronApp.evaluate(async ({ BrowserWindow }, expectedMarker) => {
    const matched = await Promise.all(
      BrowserWindow.getAllWindows().map(async (candidate) => ({
        candidate,
        marker: (await candidate.webContents
          .executeJavaScript("window.__interfaceZoomWindowMarker", true)
          .catch(() => undefined)) as unknown,
      })),
    );
    const window = matched.find((entry) => entry.marker === expectedMarker)?.candidate;
    if (!window) throw new Error("Could not find the marked Electron window");
    window.setSize(1280, 800);
    const [width, height] = window.getSize();
    if (width !== 1280 || height !== 800) {
      throw new Error(`Expected 1280x800 Electron window, received ${width}x${height}`);
    }
    await window.webContents.executeJavaScript(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
  }, marker);
}

async function sendNativeShortcut(
  harness: DesktopHarness,
  page: Page,
  keyCode: string,
  modifiers: readonly ("control" | "shift" | "alt")[],
): Promise<void> {
  const marker = `zoom-native-key-${Date.now()}-${Math.random()}`;
  await page.evaluate((value) => {
    Object.assign(globalThis.window, { __interfaceZoomNativeKeyMarker: value });
  }, marker);
  await harness.electronApp.evaluate(async ({ BrowserWindow }, args) => {
    const matches = await Promise.all(BrowserWindow.getAllWindows().map(async (candidate) => ({
      candidate,
      marker: (await candidate.webContents
        .executeJavaScript("window.__interfaceZoomNativeKeyMarker", true)
        .catch(() => undefined)) as unknown,
    })));
    const target = matches.find((entry) => entry.marker === args.marker)?.candidate;
    if (!target) throw new Error("Could not find the marked Electron window for keyboard input");
    target.show();
    target.focus();
    const keyCodes = { control: "Control", shift: "Shift", alt: "Alt" } as const;
    const activeModifiers: string[] = [];
    for (const modifier of args.modifiers) {
      const modifierKey = keyCodes[modifier];
      target.webContents.sendInputEvent({ type: "keyDown", keyCode: modifierKey });
      activeModifiers.push(modifier);
    }
    target.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: args.keyCode,
      modifiers: activeModifiers,
    });
    target.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: args.keyCode,
      modifiers: activeModifiers,
    });
    for (const modifier of [...args.modifiers].reverse()) {
      const modifierKey = keyCodes[modifier];
      target.webContents.sendInputEvent({
        type: "keyUp",
        keyCode: modifierKey,
        modifiers: activeModifiers,
      });
      activeModifiers.splice(activeModifiers.indexOf(modifier), 1);
    }
  }, { marker, keyCode, modifiers });
}

async function zoomFactorForPage(harness: DesktopHarness, page: Page): Promise<number> {
  const marker = `zoom-read-${Date.now()}-${Math.random()}`;
  await page.evaluate((value) => {
    Object.assign(globalThis.window, { __interfaceZoomReadMarker: value });
  }, marker);
  return harness.electronApp.evaluate(async ({ BrowserWindow }, expectedMarker) => {
    const windows = await Promise.all(
      BrowserWindow.getAllWindows().map(async (candidate) => ({
        candidate,
        marker: (await candidate.webContents
          .executeJavaScript("window.__interfaceZoomReadMarker", true)
          .catch(() => undefined)) as unknown,
      })),
    );
    const target = windows.find((entry) => entry.marker === expectedMarker)?.candidate;
    if (!target) throw new Error("Could not find the marked Electron window");
    return target.webContents.getZoomFactor();
  }, marker);
}

async function expectZoom(harness: DesktopHarness, page: Page, percent: number): Promise<void> {
  await expect
    .poll(async () => zoomFactorForPage(harness, page), { timeout: 5_000 })
    .toBeCloseTo(percent / 100, 2);
  await expect.poll(async () => (await getDesktopState(page)).interfaceZoom).toBe(percent);
}

async function expectWithinViewport(locator: Locator, page: Page): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.visualViewport?.width ?? window.innerWidth,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.height).toBeGreaterThan(0);
  expect(geometry.x).toBeGreaterThanOrEqual(0);
  expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
}

async function captureNativeWindow(
  harness: DesktopHarness,
  page: Page,
  proofDir: string,
  name: string,
): Promise<void> {
  const marker = `zoom-native-${Date.now()}-${Math.random()}`;
  const renderer = await page.evaluate((value) => {
    Object.assign(globalThis.window, { __interfaceZoomNativeMarker: value });
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualViewport: window.visualViewport
        ? { width: window.visualViewport.width, height: window.visualViewport.height, scale: window.visualViewport.scale }
        : null,
      elements: Object.fromEntries(
        [".sidebar", '[data-testid="composer"]', '[aria-label="Interface zoom"]'].flatMap((selector) => {
          const element = document.querySelector(selector);
          if (!element) return [];
          const rect = element.getBoundingClientRect();
          return [[selector, { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }]];
        }),
      ),
    };
  }, marker);
  const native = await harness.electronApp.evaluate(async ({ BrowserWindow }, expectedMarker) => {
    const matches = await Promise.all(BrowserWindow.getAllWindows().map(async (candidate) => ({
      candidate,
      marker: (await candidate.webContents
        .executeJavaScript("window.__interfaceZoomNativeMarker", true)
        .catch(() => undefined)) as unknown,
    })));
    const target = matches.find((entry) => entry.marker === expectedMarker)?.candidate;
    if (!target) throw new Error("Could not find the marked Electron window for native capture");
    const image = await target.webContents.capturePage();
    const size = image.getSize();
    return {
      width: size.width,
      height: size.height,
      zoomFactor: target.webContents.getZoomFactor(),
      zoomLevel: target.webContents.getZoomLevel(),
      pngBase64: image.toPNG().toString("base64"),
    };
  }, marker);
  const { pngBase64, ...nativeMetadata } = native;
  await writeFile(join(proofDir, `${name}-native.png`), Buffer.from(pngBase64, "base64"));
  await writeFile(
    join(proofDir, `${name}-geometry.json`),
    JSON.stringify({ renderer, native: nativeMetadata }, null, 2),
  );
}

async function openAppearance(window: Page): Promise<void> {
  await window.keyboard.press(desktopShortcut(","));
  await expect(window.getByTestId("settings-surface")).toBeVisible();
  await window.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(window.getByLabel("Interface zoom")).toBeVisible();
}

async function openSecondWindow(harness: DesktopHarness, source: Page): Promise<Page> {
  const before = new Set(harness.electronApp.windows());
  await sendNativeShortcut(harness, source, "N", ["control", "shift"]);
  await expect.poll(() => harness.electronApp.windows().length).toBe(before.size + 1);
  const second = harness.electronApp.windows().find((candidate) => !before.has(candidate));
  if (!second) throw new Error("Expected the new-window shortcut to create another window");
  await second.waitForFunction(() => Boolean(globalThis.window.piApp));
  return second;
}

test("applies interface zoom through Appearance, shortcuts, new windows and restart", async () => {
  test.setTimeout(120_000);
  const userDataDir = await makeUserDataDir("pi-gui-interface-zoom-");
  const workspacePath = await makeWorkspace("interface-zoom");
  const proofDir = process.env.PI_APP_INTERFACE_ZOOM_PROOF_DIR?.trim();
  if (proofDir) await mkdir(proofDir, { recursive: true });

  let harness = await launchZoomApp(userDataDir, workspacePath);

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Interface zoom fixture thread");
    await seedTranscriptMessages(harness, window, {
      count: 3,
      textFactory: (index) => {
        if (index === 0) {
          return [
            `Fixture content ${"long message used to exercise wrapping at high zoom. ".repeat(14)}`,
            "",
            "```ts",
            `const zoom = ${index};`,
            "```",
          ].join("\n");
        }
        return `Additional local fixture message ${index}: ${"layout should remain usable. ".repeat(8)}`;
      },
    });
    await window.getByTestId("transcript").getByText("const zoom = 0;").waitFor();
    await setWindowSize(harness, window);

    await openAppearance(window);
    const select = window.getByLabel("Interface zoom");
    for (const level of zoomLevels) {
      await select.selectOption(String(level));
      await expectZoom(harness, window, level);
      if (level === 125 || level === 150) {
        await expect(select).toBeVisible();
        await expectWithinViewport(select, window);
        if (proofDir) {
          await window.screenshot({
            path: join(proofDir, `appearance-${level}.png`),
            fullPage: true,
          });
          await captureNativeWindow(harness, window, proofDir, `appearance-${level}`);
        }
        await window.getByRole("button", { name: "Back to app" }).scrollIntoViewIfNeeded();
        await window.getByRole("button", { name: "Back to app" }).click();
        await expect(window.getByTestId("composer")).toBeVisible();
        await expect(window.getByTestId("transcript")).toBeVisible();
        if (proofDir) {
          await window.screenshot({
            path: join(proofDir, `workbench-${level}.png`),
            fullPage: true,
          });
          await captureNativeWindow(harness, window, proofDir, `workbench-${level}`);
        }
        await expectWithinViewport(window.locator(".sidebar"), window);
        await expectWithinViewport(window.getByTestId("composer"), window);
        await openAppearance(window);
      }
    }
    await expect
      .poll(async () => {
        const [uiState, zoomState] = await Promise.all([
          readFile(join(userDataDir, "ui-state.json"), "utf8"),
          readFile(join(userDataDir, "interface-zoom.json"), "utf8"),
        ]);
        return {
          legacyUiStateHasZoom: Object.hasOwn(JSON.parse(uiState) as object, "interfaceZoom"),
          interfaceZoom: (JSON.parse(zoomState) as { readonly interfaceZoom?: unknown })
            .interfaceZoom,
        };
      })
      .toEqual({ legacyUiStateHasZoom: false, interfaceZoom: 150 });

    // The menu accelerators and renderer key routing must share the same state.
    await sendNativeShortcut(harness, window, "-", ["control"]);
    await expectZoom(harness, window, 125);
    await sendNativeShortcut(harness, window, "-", ["control"]);
    await expectZoom(harness, window, 110);
    await sendNativeShortcut(harness, window, "-", ["control"]);
    await expectZoom(harness, window, 100);
    await sendNativeShortcut(harness, window, "-", ["control"]);
    await expectZoom(harness, window, 90);
    await sendNativeShortcut(harness, window, "-", ["control"]);
    await expectZoom(harness, window, 90);
    await window.getByRole("button", { name: "Reset to 100%" }).click();
    await expectZoom(harness, window, 100);
    await sendNativeShortcut(harness, window, "=", ["control", "shift"]);
    await expectZoom(harness, window, 110);

    const secondWindow = await openSecondWindow(harness, window);
    await expectZoom(harness, secondWindow, 110);

    const invalidZoomError = await window.evaluate(async () => {
      const app = window.piApp as unknown as {
        setInterfaceZoom(value: unknown): Promise<unknown>;
      };
      try {
        await app.setInterfaceZoom("125");
      } catch (error) {
        return String(error);
      }
      return "no error";
    });
    expect(invalidZoomError).toMatch(/Unsupported interface zoom/);
    await expectZoom(harness, window, 110);
    await expectZoom(harness, secondWindow, 110);

    await window.getByLabel("Interface zoom").selectOption("125");
    await expectZoom(harness, window, 125);
    await expectZoom(harness, secondWindow, 125);
    await window.getByRole("button", { name: "Reset to 100%" }).click();
    await expectZoom(harness, window, 100);
    await expectZoom(harness, secondWindow, 100);
  } finally {
    await harness.close();
  }

  harness = await launchZoomApp(userDataDir, workspacePath);
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await expectZoom(harness, window, 100);
    await openAppearance(window);
    await window.getByLabel("Interface zoom").selectOption("150");
    await expectZoom(harness, window, 150);
  } finally {
    await harness.close();
  }

  harness = await launchZoomApp(userDataDir, workspacePath);
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await expectZoom(harness, window, 150);
  } finally {
    await harness.close();
  }
});
