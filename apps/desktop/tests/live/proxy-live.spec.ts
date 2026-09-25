import { createServer, connect, type Socket } from "node:net";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  launchDesktop,
  launchDesktopByExecutable,
  type DesktopHarness,
} from "../helpers/electron-app";

type TunnelRecord = {
  target: string;
  status: number;
  clientBytes: number;
  proxyBytes: number;
};

type ProxyRelay = {
  readonly url: string;
  readonly records: TunnelRecord[];
  close(): Promise<void>;
};

type NetworkEvidence = {
  webSocket: {
    constructed: number;
    opened: number;
    messages: number;
    sent: number;
    closed: number;
    forcedFailures: number;
  };
  fetch: {
    count: number;
    sseFrameCount: number;
    responses: Array<{ status: number; contentType: string; sseFrames: number }>;
  };
};

const REAL_AUTH_ENABLED = process.env.PI_APP_REAL_AUTH === "1";
const AUTH_SOURCE_DIR = process.env.PI_APP_REAL_AUTH_SOURCE_DIR?.trim();
const PROVIDER = process.env.PI_GUI_PROVIDER?.trim() || "openai-codex";
const MODEL = process.env.PI_GUI_MODEL?.trim() || "gpt-6-luna";
const PACKAGED = process.env.PI_PROXY_PACKAGED === "1";
const SHELL_PATH = process.env.PI_PROXY_SHELL_PATH?.trim();
const DESKTOP_DIR = resolve(__dirname, "../..");
const REPO_ROOT = resolve(DESKTOP_DIR, "../..");

test.describe("live proxy verification", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    testInfo.setTimeout(300_000);
    if (!REAL_AUTH_ENABLED || !AUTH_SOURCE_DIR) {
      testInfo.skip(
        !REAL_AUTH_ENABLED,
        "Set PI_APP_REAL_AUTH=1 and PI_APP_REAL_AUTH_SOURCE_DIR to run real-provider proxy verification.",
      );
    }
    if (!AUTH_SOURCE_DIR) {
      throw new Error("PI_APP_REAL_AUTH=1 requires PI_APP_REAL_AUTH_SOURCE_DIR.");
    }
  });

  test("real WebSocket conversation, follow-up and echo tool use go through the proxy", async () => {
    await runProxyConversation({ forceWebSocketFailure: false });
  });

  test("a failed WebSocket construction falls back to real SSE through the proxy", async () => {
    await runProxyConversation({ forceWebSocketFailure: true });
  });
});

async function runProxyConversation(options: { forceWebSocketFailure: boolean }): Promise<void> {
  const info = test.info();
  const evidenceDir = info.outputPath();
  await mkdir(evidenceDir, { recursive: true });

  const privateRoot = await mkdtemp(join(tmpdir(), "pi-gui-proxy-private-"));
  await chmod(privateRoot, 0o700);
  const profile = join(privateRoot, "profile");
  const agentDir = join(privateRoot, "agent");
  const workspace = join(privateRoot, "workspace");
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  await mkdir(workspace, { recursive: true, mode: 0o700 });

  const sourceDir = AUTH_SOURCE_DIR;
  if (!sourceDir) throw new Error("Real provider auth source is unavailable.");
  if (!SHELL_PATH) throw new Error("PI_PROXY_SHELL_PATH must point to a usable Bash executable.");
  const sourceAuth = JSON.parse(await readFile(join(sourceDir, "auth.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const selectedCredentials = sourceAuth[PROVIDER];
  if (!selectedCredentials) {
    throw new Error(`No saved credentials for selected provider ${PROVIDER}.`);
  }
  await writeFile(
    join(agentDir, "auth.json"),
    `${JSON.stringify({ [PROVIDER]: selectedCredentials })}\n`,
    { mode: 0o600 },
  );

  const relay = await startConnectRelay();
  await writeFile(
    join(agentDir, "settings.json"),
    `${JSON.stringify(
      {
        defaultProvider: PROVIDER,
        defaultModel: MODEL,
        defaultThinkingLevel: "off",
        enabledModels: [`${PROVIDER}/${MODEL}`],
        httpProxy: relay.url,
        shellPath: SHELL_PATH,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  let harness: DesktopHarness | undefined;
  let traceStarted = false;
  const evidence: NetworkEvidence = {
    webSocket: {
      constructed: 0,
      opened: 0,
      messages: 0,
      sent: 0,
      closed: 0,
      forcedFailures: 0,
    },
    fetch: { count: 0, sseFrameCount: 0, responses: [] },
  };
  const assistantChecks = {
    initialTurn: false,
    followUpTurn: false,
    echoToolOutput: false,
  };

  try {
    harness = await launchApp(profile, {
      agentDir,
      initialWorkspaces: [workspace],
      scrubProviderEnv: true,
      envOverrides: {
        PI_APP_TEST_MODE: undefined,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        NO_PROXY: "",
        http_proxy: "",
        https_proxy: "",
        no_proxy: "",
      },
    });
    await harness.focusWindow();
    const page = await harness.firstWindow();
    const identity = await captureDoctor(harness, page, profile, evidenceDir, PACKAGED);
    const instrumentation = await installNetworkCounters(harness, options.forceWebSocketFailure);
    expect(instrumentation).toEqual({
      webSocketWrapped: true,
      fetchWrapped: true,
      forceWebSocketFailure: options.forceWebSocketFailure,
    });
    await harness.electronApp.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    traceStarted = true;

    await sendInitialTurn(page);
    const assistant = page.locator(".timeline-item--assistant .message__content");
    await expect(assistant.last()).toContainText("PI_PROXY_TURN_ONE_OK", { timeout: 180_000 });
    await expect
      .poll(() => latestAssistantText(page), { timeout: 180_000 })
      .toContain("PI_PROXY_TURN_ONE_OK");
    const firstTurnAssistant = (await assistant.allTextContents()).join("\n");
    expect(firstTurnAssistant).toContain("PI_PROXY_TURN_ONE_OK");
    assistantChecks.initialTurn = true;
    await expect(page.getByTestId("send")).not.toHaveAttribute("aria-label", "Stop run", {
      timeout: 120_000,
    });
    await page.screenshot({ path: join(evidenceDir, "turn-one.png") });

    const composer = page.getByTestId("composer");
    await composer.fill(
      "Use your shell tool to run exactly `echo PI_PROXY_ECHO_OK > proxy-tool-proof.txt && cat proxy-tool-proof.txt`. Wait until the command succeeds and its output is PI_PROXY_ECHO_OK, then reply with exactly PI_PROXY_TURN_TWO_OK.",
    );
    await composer.press("Enter");
    await expect(assistant.last()).toContainText("PI_PROXY_TURN_TWO_OK", { timeout: 180_000 });
    const finalAssistantText = (await assistant.allTextContents()).join("\n");
    expect(finalAssistantText).toContain("PI_PROXY_TURN_ONE_OK");
    expect(finalAssistantText).toContain("PI_PROXY_TURN_TWO_OK");
    assistantChecks.followUpTurn = true;
    await expect
      .poll(() => page.locator(".timeline-tool").count(), { timeout: 120_000 })
      .toBeGreaterThan(0);
    const toolItem = page.locator(".timeline-tool").first();
    const toolHeader = toolItem.locator(".timeline-tool__header");
    await expect(toolItem).not.toHaveClass(/timeline-tool--failed/);
    await toolHeader.click();
    await expect(toolHeader).toHaveAttribute("aria-expanded", "true");
    await expect(toolItem.locator(".timeline-tool__body")).toBeVisible();
    await expect(toolItem.locator(".timeline-tool__pre")).toContainText("PI_PROXY_ECHO_OK");
    const toolProof = await readFile(join(workspace, "proxy-tool-proof.txt"), "utf8");
    expect(toolProof.trim()).toBe("PI_PROXY_ECHO_OK");
    assistantChecks.echoToolOutput = true;

    const networkEvidence = await readNetworkCounters(harness);
    Object.assign(evidence, networkEvidence);
    expect(evidence.webSocket.constructed).toBeGreaterThan(0);
    if (options.forceWebSocketFailure) {
      expect(evidence.webSocket.forcedFailures).toBeGreaterThan(0);
      expect(
        evidence.fetch.responses.some(
          (response) =>
            response.status === 200 &&
            (response.contentType.toLowerCase().includes("text/event-stream") ||
              response.sseFrames > 0),
        ),
      ).toBe(true);
      expect(evidence.fetch.sseFrameCount).toBeGreaterThan(0);
    } else {
      expect(evidence.webSocket.opened).toBeGreaterThan(0);
      expect(evidence.webSocket.messages).toBeGreaterThan(0);
      expect(evidence.webSocket.sent).toBeGreaterThan(0);
    }
    expect(
      relay.records.some(({ target, status }) => status === 200 && isChatGptTarget(target)),
    ).toBe(true);
    await page.screenshot({ path: join(evidenceDir, "completed.png") });

    await writeFile(
      join(evidenceDir, "doctor.json"),
      JSON.stringify({ ...identity, provider: PROVIDER, model: MODEL }, null, 2),
    );
  } finally {
    if (harness) {
      try {
        if (traceStarted) {
          await harness.electronApp
            .context()
            .tracing.stop({ path: join(evidenceDir, "proxy-conversation.zip") });
        }
      } finally {
        await harness.close();
      }
    }
    await writeFile(
      join(evidenceDir, "proxy-evidence.json"),
      JSON.stringify(
        {
          mode: options.forceWebSocketFailure ? "websocket-failure-sse-fallback" : "websocket",
          network: evidence,
          relay: {
            connectCount: relay.records.length,
            tunnels: relay.records.map(({ target, status, clientBytes, proxyBytes }) => ({
              target,
              status,
              clientBytes,
              proxyBytes,
            })),
          },
          assistantChecks,
        },
        null,
        2,
      ),
    );
    await relay.close();
  }
}

function launchApp(
  userDataDir: string,
  options: Parameters<typeof launchDesktop>[1],
): Promise<DesktopHarness> {
  if (PACKAGED) {
    return launchDesktopByExecutable(
      resolve(
        REPO_ROOT,
        process.env.PI_PROXY_EXECUTABLE || "apps/desktop/release/win-unpacked/pi-gui.exe",
      ),
      userDataDir,
      options,
    );
  }
  return launchDesktop(userDataDir, options);
}

async function captureDoctor(
  harness: DesktopHarness,
  page: Page,
  profile: string,
  evidenceDir: string,
  packaged: boolean,
): Promise<Record<string, unknown>> {
  const identity = await harness.electronApp.evaluate(({ app, BrowserWindow }) => ({
    pid: process.pid,
    userData: app.getPath("userData"),
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    testMode: process.env.PI_APP_TEST_MODE ?? null,
    testHooks: "__PI_APP_TEST_HOOKS" in globalThis,
    visible: BrowserWindow.getAllWindows()[0]?.isVisible() ?? false,
    focused: BrowserWindow.getAllWindows()[0]?.isFocused() ?? false,
  }));
  const documentFocused = await page.evaluate(() => document.hasFocus());
  const doctor = { ...identity, documentFocused };
  await writeFile(join(evidenceDir, "doctor.json"), JSON.stringify(doctor, null, 2));
  expect(identity).toMatchObject({
    isPackaged: packaged,
    testMode: null,
    testHooks: false,
    visible: true,
  });
  expect(identity.focused || documentFocused).toBe(true);
  expect(resolve(identity.userData)).toBe(resolve(profile));
  if (!packaged) expect(resolve(identity.appPath)).toBe(DESKTOP_DIR);
  return doctor;
}

async function installNetworkCounters(
  harness: DesktopHarness,
  forceWebSocketFailure: boolean,
): Promise<{
  webSocketWrapped: boolean;
  fetchWrapped: boolean;
  forceWebSocketFailure: boolean;
}> {
  return harness.electronApp.evaluate(
    (_, { forceFailure }) => {
      const state = {
        webSocket: {
          constructed: 0,
          opened: 0,
          messages: 0,
          sent: 0,
          closed: 0,
          forcedFailures: 0,
        },
        fetch: {
          count: 0,
          sseFrameCount: 0,
          responses: [] as Array<{
            status: number;
            contentType: string;
            sseFrames: number;
          }>,
        },
      };
      const pendingScans: Promise<void>[] = [];
      Object.defineProperty(globalThis, "__piProxyPendingSseScans", {
        configurable: false,
        enumerable: false,
        value: pendingScans,
      });
      Object.defineProperty(globalThis, "__piProxyNetworkEvidence", {
        configurable: false,
        enumerable: false,
        value: state,
      });

      const NativeWebSocket = globalThis.WebSocket;
      class ObservedWebSocket extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          state.webSocket.constructed += 1;
          if (forceFailure) {
            state.webSocket.forcedFailures += 1;
            throw new Error("Intentional WebSocket failure for SSE fallback verification");
          }
          if (protocols === undefined) super(url);
          else super(url, protocols);
          this.addEventListener("open", () => state.webSocket.opened++);
          this.addEventListener("message", () => state.webSocket.messages++);
          this.addEventListener("close", () => state.webSocket.closed++);
        }

        override send(...args: Parameters<WebSocket["send"]>): void {
          state.webSocket.sent += 1;
          super.send(...args);
        }
      }
      Object.defineProperty(globalThis, "WebSocket", {
        configurable: true,
        writable: true,
        value: ObservedWebSocket,
      });

      const countOneSseFrame = async (response: Response): Promise<number> => {
        const reader = response.body?.getReader();
        if (!reader) return 0;
        const decoder = new TextDecoder();
        let scannedCharacters = 0;
        let lineLength = 0;
        let linePrefix = "";
        let hasDataField = false;
        try {
          while (scannedCharacters < 65_536) {
            const { done, value } = await reader.read();
            const chunk = decoder.decode(value, { stream: !done });
            for (const character of chunk) {
              scannedCharacters += 1;
              if (character === "\r") continue;
              if (character === "\n") {
                if (lineLength === 0) {
                  if (hasDataField) return 1;
                  hasDataField = false;
                } else if (linePrefix === "data:") {
                  hasDataField = true;
                }
                lineLength = 0;
                linePrefix = "";
              } else {
                if (lineLength < 5) linePrefix += character;
                lineLength += 1;
              }
              if (scannedCharacters >= 65_536) break;
            }
            if (done) return hasDataField || linePrefix === "data:" ? 1 : 0;
          }
          return 0;
        } finally {
          void reader.cancel().catch(() => {});
        }
      };

      const nativeFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        state.fetch.count += 1;
        const response = await nativeFetch(input, init);
        const responseEvidence = {
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          sseFrames: 0,
        };
        state.fetch.responses.push(responseEvidence);
        const scan = countOneSseFrame(response.clone())
          .then((count) => {
            responseEvidence.sseFrames = count;
            state.fetch.sseFrameCount += count;
          })
          .catch(() => {});
        pendingScans.push(scan);
        return response;
      };
      return {
        webSocketWrapped: globalThis.WebSocket === ObservedWebSocket,
        fetchWrapped: globalThis.fetch !== nativeFetch,
        forceWebSocketFailure: forceFailure,
      };
    },
    { forceFailure: forceWebSocketFailure },
  );
}

async function readNetworkCounters(harness: DesktopHarness): Promise<NetworkEvidence> {
  return harness.electronApp.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __piProxyNetworkEvidence: NetworkEvidence;
      }
    ).__piProxyNetworkEvidence;
    const pendingScans = (
      globalThis as typeof globalThis & { __piProxyPendingSseScans: Promise<void>[] }
    ).__piProxyPendingSseScans;
    return Promise.all(pendingScans).then(
      () => JSON.parse(JSON.stringify(state)) as NetworkEvidence,
    );
  });
}

async function sendInitialTurn(page: Page): Promise<void> {
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "New thread", exact: true })
    .click();
  await page
    .getByLabel("New thread prompt", { exact: true })
    .fill("Do not use tools. Reply with exactly PI_PROXY_TURN_ONE_OK.");
  await page.getByRole("button", { name: "Start thread", exact: true }).click();
}

async function latestAssistantText(page: Page): Promise<string> {
  return (
    (await page.locator(".timeline-item--assistant .message__content").last().textContent()) ?? ""
  );
}

function isChatGptTarget(target: string): boolean {
  const hostname = target.slice(0, target.lastIndexOf(":")).toLowerCase();
  return hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com");
}

async function startConnectRelay(): Promise<ProxyRelay> {
  const records: TunnelRecord[] = [];
  const server = createServer((client) => {
    let requestHeader = Buffer.alloc(0);
    let upstream: Socket | undefined;
    let connected = false;
    let current: TunnelRecord | undefined;

    const fail = () => {
      client.destroy();
      upstream?.destroy();
    };
    client.on("error", fail);
    client.on("data", (chunk: Buffer) => {
      if (connected && upstream && current) {
        current.clientBytes += chunk.length;
        upstream.write(chunk);
        return;
      }
      requestHeader = Buffer.concat([requestHeader, chunk]);
      const end = requestHeader.indexOf("\r\n\r\n");
      if (end < 0) return;
      const header = requestHeader.subarray(0, end).toString("latin1");
      const match = /^CONNECT ([^\s]+) HTTP\/1\.[01]$/im.exec(header);
      const target = match?.[1];
      if (!target || !/^[-.\w\[\]:]+$/.test(target)) {
        fail();
        return;
      }
      const separator = target.lastIndexOf(":");
      const hostname = target.startsWith("[")
        ? target.slice(1, target.indexOf("]"))
        : target.slice(0, separator);
      const port = Number(target.slice(separator + 1));
      if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
        fail();
        return;
      }

      upstream = connect({ host: "127.0.0.1", port: 7897 });
      upstream.on("error", fail);
      let proxyHeader = Buffer.alloc(0);
      upstream.on("connect", () => {
        upstream!.write(
          `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Connection: Keep-Alive\r\n\r\n`,
        );
      });
      upstream.on("data", (proxyChunk: Buffer) => {
        if (!connected) {
          proxyHeader = Buffer.concat([proxyHeader, proxyChunk]);
          const proxyEnd = proxyHeader.indexOf("\r\n\r\n");
          if (proxyEnd < 0) return;
          const responseHeader = proxyHeader.subarray(0, proxyEnd).toString("latin1");
          const status = /^HTTP\/1\.[01] (\d{3})/i.exec(responseHeader)?.[1];
          current = {
            target: `${hostname}:${port}`,
            status: Number(status ?? 0),
            clientBytes: 0,
            proxyBytes: 0,
          };
          records.push(current);
          client.write(proxyHeader.subarray(0, proxyEnd + 4));
          const initialPayload = proxyHeader.subarray(proxyEnd + 4);
          if (initialPayload.length) {
            current.proxyBytes += initialPayload.length;
            client.write(initialPayload);
          }
          if (current.status !== 200) {
            fail();
            return;
          }
          connected = true;
          const initialClientPayload = requestHeader.subarray(end + 4);
          if (initialClientPayload.length) {
            current.clientBytes += initialClientPayload.length;
            upstream!.write(initialClientPayload);
          }
          return;
        }
        if (current) current.proxyBytes += proxyChunk.length;
        client.write(proxyChunk);
      });
      client.removeAllListeners("data");
      client.on("data", (data: Buffer) => {
        if (!connected || !upstream || !current) return;
        current.clientBytes += data.length;
        upstream.write(data);
      });
      upstream.on("close", () => client.destroy());
    });
    client.on("close", () => upstream?.destroy());
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start proxy relay.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    records,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
}
