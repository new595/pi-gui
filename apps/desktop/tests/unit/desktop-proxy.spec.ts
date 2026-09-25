import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { expect, test } from "@playwright/test";
import { createJiti } from "jiti";
import { fetch as undiciFetch, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import {
  listenLoopback,
  runNodeWithTrustedTestCertificate,
  startLocalConnectProxy,
} from "../helpers/proxy-fixture";

const testCertificateDirectory = join(__dirname, "../fixtures/proxy");

const jiti = createJiti(__filename);
let createDesktopProxyDispatcher: typeof import("../../electron/network/desktop-proxy").createDesktopProxyDispatcher;
let initializeDesktopProxy: typeof import("../../electron/network/desktop-proxy").initializeDesktopProxy;
let resolveDesktopProxyOptions: typeof import("../../electron/network/desktop-proxy").resolveDesktopProxyOptions;
test.beforeAll(async () => {
  ({ createDesktopProxyDispatcher, initializeDesktopProxy, resolveDesktopProxyOptions } =
    await jiti.import<typeof import("../../electron/network/desktop-proxy")>(
      "../../electron/network/desktop-proxy.ts",
    ));
});

test("resolves explicit, environment, and protocol-specific proxy configuration", () => {
  const explicit = resolveDesktopProxyOptions(
    { httpProxy: " https://user:pass@proxy.example:8443 " },
    {
      HTTP_PROXY: "http://env.example:8080",
      HTTPS_PROXY: "http://secure.example:8081",
      NO_PROXY: ".local",
    },
  );
  expect(explicit).toEqual({
    httpProxy: "https://user:pass@proxy.example:8443",
    httpsProxy: "https://user:pass@proxy.example:8443",
    noProxy: ".local",
  });
  expect(resolveDesktopProxyOptions({ httpProxy: "  " }, { HTTP_PROXY: "http://h:1" })).toEqual({
    httpProxy: "http://h:1",
    httpsProxy: "",
    noProxy: "",
  });
  expect(resolveDesktopProxyOptions({}, { HTTPS_PROXY: "http://s:2" })).toEqual({
    httpProxy: "",
    httpsProxy: "http://s:2",
    noProxy: "",
  });
  expect(resolveDesktopProxyOptions({}, {})).toEqual({
    httpProxy: "",
    httpsProxy: "",
    noProxy: "",
  });
  expect(
    resolveDesktopProxyOptions(
      { httpProxy: "http://explicit.example:80" },
      { HTTP_PROXY: "socks5://invalid:secret", HTTPS_PROXY: "not a proxy" },
    ),
  ).toEqual({
    httpProxy: "http://explicit.example:80",
    httpsProxy: "http://explicit.example:80",
    noProxy: "",
  });
});

test("rejects invalid explicit/environment proxy values without echoing credentials", () => {
  for (const settings of [
    { httpProxy: null },
    { httpProxy: 7 },
    { httpProxy: "socks5://u:p@host" },
    { httpProxy: "http://u:p@%" },
  ]) {
    expect(() => resolveDesktopProxyOptions(settings, {})).toThrow("Invalid httpProxy");
  }
  expect(() =>
    resolveDesktopProxyOptions({}, { HTTPS_PROXY: "socks5://name:secret@proxy" }),
  ).toThrow("Invalid proxy environment configuration");
});

test("a local CONNECT proxy carries successive HTTP and SSE requests", async () => {
  const requests: string[] = [];
  const origin = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push(request.url ?? "");
    if (request.url === "/events") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end("data: ready\n\n");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ path: request.url }));
  });
  const originUrl = await listenLoopback(origin);
  const proxy = await startLocalConnectProxy();
  const previousDispatcher = getGlobalDispatcher();
  const dispatcher = createDesktopProxyDispatcher({}, { HTTP_PROXY: proxy.url, NO_PROXY: "" });
  try {
    const one = await undiciFetch(`${originUrl}/first`, { dispatcher });
    expect(await one.json()).toEqual({ path: "/first" });
    const two = await undiciFetch(`${originUrl}/events`, { dispatcher });
    expect(await two.text()).toBe("data: ready\n\n");
    const three = await undiciFetch(`${originUrl}/after-tool`, { dispatcher });
    expect(await three.json()).toEqual({ path: "/after-tool" });
    expect(requests).toEqual(["/first", "/events", "/after-tool"]);
    expect(proxy.tunnels()).toBeGreaterThanOrEqual(1);
  } finally {
    setGlobalDispatcher(previousDispatcher);
    await dispatcher.close();
    await proxy.close();
    await new Promise<void>((resolve) => origin.close(() => resolve()));
  }
});

test("NO_PROXY bypasses both explicit and environment proxy sources", async () => {
  const origin = createServer((_request, response) => response.end("direct"));
  const originUrl = await listenLoopback(origin);
  const proxy = await startLocalConnectProxy();
  for (const settings of [{ httpProxy: proxy.url }, {}]) {
    const previousDispatcher = getGlobalDispatcher();
    const dispatcher = createDesktopProxyDispatcher(settings, {
      HTTP_PROXY: settings.httpProxy ? undefined : proxy.url,
      NO_PROXY: "127.0.0.1",
    });
    try {
      const response = await undiciFetch(originUrl, { dispatcher });
      expect(await response.text()).toBe("direct");
      expect(proxy.tunnels()).toBe(0);
    } finally {
      setGlobalDispatcher(previousDispatcher);
      await dispatcher.close();
    }
  }
  await proxy.close();
  await new Promise<void>((resolve) => origin.close(() => resolve()));
});

test("an unreachable local proxy fails a real request without exposing proxy credentials", async () => {
  const dispatcher = createDesktopProxyDispatcher(
    {},
    {
      HTTP_PROXY: "http://private-user:private-password@127.0.0.1:1",
      NO_PROXY: "",
    },
  );
  try {
    let message = "";
    try {
      await undiciFetch("http://example.invalid/", { dispatcher });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("private-user");
    expect(message).not.toContain("private-password");
  } finally {
    await dispatcher.close();
  }
});

test("installed dispatcher carries a WebSocket handshake and message through CONNECT", async () => {
  const origin = createServer();
  origin.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") return socket.destroy();
    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.write(Buffer.from([0x81, 0x02, 0x6f, 0x6b]));
    socket.end();
  });
  const originUrl = await listenLoopback(origin);
  const proxy = await startLocalConnectProxy();
  const agentDir = await mkdtemp(join(tmpdir(), "pi-gui-proxy-ws-"));
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({ httpProxy: proxy.url }),
    "utf8",
  );
  const previousDispatcher = getGlobalDispatcher();
  const installedGlobalNames = [
    "fetch",
    "Headers",
    "Request",
    "Response",
    "FormData",
    "WebSocket",
    "EventSource",
  ];
  const originalGlobals = new Map(
    installedGlobalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  let installedDispatcher: Awaited<ReturnType<typeof initializeDesktopProxy>> | undefined;
  try {
    installedDispatcher = await initializeDesktopProxy({ agentDir, env: { NO_PROXY: "" } });
    const message = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(originUrl.replace("http://", "ws://"));
      socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket failed")), { once: true });
    });
    expect(message).toBe("ok");
    expect(proxy.tunnels()).toBeGreaterThan(0);
  } finally {
    setGlobalDispatcher(previousDispatcher);
    await installedDispatcher?.destroy();
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await proxy.close();
    await new Promise<void>((resolve) => origin.close(() => resolve()));
  }
});

test("HTTP_PROXY and HTTPS_PROXY route HTTP, HTTPS, and WSS through local CONNECT tunnels", async () => {
  const [cert, key] = await Promise.all([
    readFile(join(testCertificateDirectory, "localhost-cert.pem"), "utf8"),
    readFile(join(testCertificateDirectory, "localhost-key.pem"), "utf8"),
  ]);
  const secureOrigin = createHttpsServer({ cert, key }, (_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("tls-through-proxy");
  });
  const websocketOrigin = createHttpsServer({ cert, key });
  websocketOrigin.on("upgrade", (request, socket) => {
    const keyHeader = request.headers["sec-websocket-key"];
    if (typeof keyHeader !== "string") return socket.destroy();
    const accept = createHash("sha1")
      .update(`${keyHeader}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.write(Buffer.from([0x81, 0x02, 0x6f, 0x6b]));
    socket.end();
  });
  const plainOrigin = createServer((_req, res) => res.end("http-through-proxy"));
  const plainUrl = await listenLoopback(plainOrigin);
  const secureUrl = (await listenLoopback(secureOrigin)).replace("http://", "https://");
  const websocketUrl = (await listenLoopback(websocketOrigin)).replace("http://", "wss://");
  const httpProxy = await startLocalConnectProxy();
  const httpsProxy = await startLocalConnectProxy();
  try {
    const { stdout } = await runNodeWithTrustedTestCertificate(
      join(__dirname, "../helpers/proxy-tls-child.mjs"),
      [httpProxy.url, httpsProxy.url, plainUrl, secureUrl, websocketUrl],
      resolve(join(testCertificateDirectory, "localhost-cert.pem")),
    );
    expect(stdout).toContain("HTTP, HTTPS, and WSS proxy fixtures passed");
    expect(httpProxy.tunnels()).toBeGreaterThan(0);
    expect(httpsProxy.tunnels()).toBeGreaterThanOrEqual(2);
  } finally {
    await httpsProxy.close();
    await httpProxy.close();
    await new Promise<void>((resolve) => plainOrigin.close(() => resolve()));
    await new Promise<void>((resolve) => secureOrigin.close(() => resolve()));
    await new Promise<void>((resolve) => websocketOrigin.close(() => resolve()));
  }
});
