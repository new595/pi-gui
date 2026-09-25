import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJiti } from "jiti";

const [httpProxy, httpsProxy, plainUrl, secureUrl, websocketUrl] = process.argv.slice(2);
if (!httpProxy || !httpsProxy || !plainUrl || !secureUrl || !websocketUrl) {
  throw new Error("The proxy TLS child requires both proxies and all three local URLs.");
}

const source = path.resolve("apps/desktop/electron/network/desktop-proxy.ts");
const jiti = createJiti(source);
const { createDesktopProxyDispatcher, initializeDesktopProxy } = await jiti.import(source);
const { fetch } = await import("undici");

const dispatcher = createDesktopProxyDispatcher(
  {},
  { HTTP_PROXY: httpProxy, HTTPS_PROXY: httpsProxy, NO_PROXY: "" },
);
try {
  const plainResponse = await fetch(plainUrl, { dispatcher });
  if ((await plainResponse.text()) !== "http-through-proxy") {
    throw new Error("HTTP fixture response mismatch.");
  }
  const secureResponse = await fetch(secureUrl, { dispatcher });
  if ((await secureResponse.text()) !== "tls-through-proxy") {
    throw new Error("HTTPS fixture response mismatch.");
  }
} finally {
  await dispatcher.close();
}

const agentDir = await mkdtemp(path.join(tmpdir(), "pi-gui-proxy-wss-"));
try {
  await writeFile(path.join(agentDir, "settings.json"), JSON.stringify({ httpProxy: httpsProxy }));
  const installed = await initializeDesktopProxy({ agentDir, env: { NO_PROXY: "" } });
  try {
    const socket = new WebSocket(websocketUrl);
    const closed = new Promise((resolve) =>
      socket.addEventListener("close", resolve, { once: true }),
    );
    const message = await new Promise((resolve, reject) => {
      socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
      socket.addEventListener("error", () => reject(new Error("WSS fixture connection failed.")), {
        once: true,
      });
    });
    if (message !== "ok") throw new Error("WSS fixture message mismatch.");
    await closed;
  } finally {
    await installed.destroy();
  }
} finally {
  await rm(agentDir, { recursive: true, force: true });
}

process.stdout.write("HTTP, HTTPS, and WSS proxy fixtures passed\n");
