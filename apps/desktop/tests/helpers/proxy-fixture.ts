import { createServer, type Server } from "node:http";
import { connect, type AddressInfo, type Server as NetServer, type Socket } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runNodeWithTrustedTestCertificate(
  helperPath: string,
  args: readonly string[],
  certificatePath: string,
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return execFileAsync(process.execPath, [helperPath, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_EXTRA_CA_CERTS: certificatePath },
    timeout: 15_000,
    windowsHide: true,
  });
}

export interface LocalConnectProxy {
  readonly url: string;
  readonly tunnels: () => number;
  close(): Promise<void>;
}

/** A real loopback HTTP forward proxy that establishes CONNECT tunnels. */
export async function startLocalConnectProxy(): Promise<LocalConnectProxy> {
  let tunnelCount = 0;
  const sockets = new Set<Socket>();
  const proxy: Server = createServer((_request, response) => {
    response.writeHead(501);
    response.end("Only CONNECT is supported by this fixture");
  });
  proxy.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  proxy.on("connect", (request, client, head) => {
    const separator = request.url?.lastIndexOf(":") ?? -1;
    const hostname = request.url?.slice(0, separator);
    const port = Number(request.url?.slice(separator + 1));
    if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const upstream = connect(port, hostname);
    sockets.add(upstream);
    upstream.once("close", () => sockets.delete(upstream));
    upstream.once("connect", () => {
      tunnelCount += 1;
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.once("error", () => client.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", () => {
      proxy.off("error", reject);
      resolve();
    });
  });
  const address = proxy.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    tunnels: () => tunnelCount,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        proxy.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export async function listenLoopback(server: NetServer): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
