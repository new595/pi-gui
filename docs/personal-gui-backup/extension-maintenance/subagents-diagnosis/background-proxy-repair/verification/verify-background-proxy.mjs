import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const nodeExe = process.execPath;
const runnerDispatcher = 'C:/Users/lwj/.pi/agent/npm/node_modules/pi-subagents/src/runs/background/runner-http-dispatcher.js';
const scriptPath = fileURLToPath(import.meta.url);

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}
function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
async function reserveThenReleasePort() {
  const server = net.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

// Minimal local HTTP CONNECT proxy. It records tunnel attempts and only connects
// to loopback fixture origins supplied by this harness.
const tunnelTargets = [];
const proxiedRequests = [];
const proxy = createServer();
proxy.on('connect', (request, client, head) => {
  const target = String(request.url ?? '');
  tunnelTargets.push(target);
  const split = target.lastIndexOf(':');
  const host = target.slice(0, split).replace(/^\[|\]$/g, '');
  const port = Number(target.slice(split + 1));
  if (host !== '127.0.0.1' || !Number.isInteger(port)) {
    client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  const upstream = net.connect(port, host);
  let requestBuffer = '';
  client.on('data', (chunk) => {
    const input = requestBuffer + chunk.toString('latin1');
    const lines = input.matchAll(/(?:^|\r\n)[A-Z]+ (\/[^\s]*) HTTP\/1\.[01]/g);
    for (const match of lines) proxiedRequests.push(match[1]);
    const lastLineBreak = input.lastIndexOf('\r\n');
    requestBuffer = lastLineBreak < 0 ? input : input.slice(lastLineBreak + 2);
  });
  upstream.once('connect', () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  upstream.once('error', () => client.destroy());
  client.once('error', () => upstream.destroy());
  client.once('close', () => upstream.destroy());
});

const requests = [];
const origin = createServer((request, response) => {
  requests.push(request.url ?? '');
  if (request.url === '/events') {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    response.end('data: local-ready\n\n');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ path: request.url }));
});
origin.on('upgrade', (request, socket) => {
  requests.push(request.url ?? '');
  const key = request.headers['sec-websocket-key'];
  if (typeof key !== 'string') return socket.destroy();
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.write(Buffer.from([0x81, 0x02, 0x6f, 0x6b]));
  socket.end();
});

async function runChild(scenario, agentDir, originUrl, badProxyUrl = '') {
  const env = { ...process.env };
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[name];
  env.NO_PROXY = scenario === 'no-proxy' ? '127.0.0.1' : '';
  env.no_proxy = scenario === 'no-proxy' ? '127.0.0.1' : '';
  const child = spawn(nodeExe, [scriptPath, '--child', scenario, agentDir, originUrl, runnerDispatcher, badProxyUrl], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => child.kill(), 15_000);
    child.once('error', reject);
    child.once('close', (exitCode) => { clearTimeout(timeout); resolve(exitCode); });
  });
  if (code !== 0) throw new Error(`${scenario} child failed (${code})\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  return { stdout, stderr };
}

if (process.argv[2] === '--child') {
  const [, , , scenario, agentDir, originUrl, dispatcherPath, badProxyUrl] = process.argv;
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    assert.equal(process.env[name], undefined, `${name} was not cleared in the child environment`);
  }
  if (scenario === 'bad-explicit-proxy') {
    // The runner reads settings during installation, so write the bad value
    // before importing/installing the dispatcher.
    await writeFile(path.join(agentDir, 'settings.json'), JSON.stringify({ httpProxy: badProxyUrl }), 'utf8');
  }
  const { installRunnerHttpDispatcher } = await import(pathToFileURL(dispatcherPath).href);
  installRunnerHttpDispatcher({ agentDir, cwd: agentDir });
  if (typeof fetch !== 'function') throw new Error('global fetch was not installed');
  if (typeof WebSocket !== 'function') throw new Error('global WebSocket was not installed');

  if (scenario === 'settings-proxy') {
    const first = await fetch(`${originUrl}/http`);
    assert.deepEqual(await first.json(), { path: '/http' });
    const events = await fetch(`${originUrl}/events`);
    assert.equal(await events.text(), 'data: local-ready\n\n');
    const message = await new Promise((resolve, reject) => {
      const socket = new WebSocket(originUrl.replace('http://', 'ws://').replace(/\/$/, '') + '/socket');
      const timeout = setTimeout(() => reject(new Error('WebSocket fixture timed out')), 5000);
      socket.addEventListener('message', (event) => { clearTimeout(timeout); resolve(String(event.data)); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket fixture failed')); }, { once: true });
    });
    assert.equal(message, 'ok');
    process.stdout.write('settings proxy carried HTTP, SSE, and global WebSocket\n');
  } else if (scenario === 'no-proxy') {
    const response = await fetch(`${originUrl}/direct`);
    assert.deepEqual(await response.json(), { path: '/direct' });
    process.stdout.write('NO_PROXY direct request succeeded\n');
  } else if (scenario === 'bad-explicit-proxy') {
    let failed = false;
    try { await fetch(`${originUrl}/must-fail`); } catch { failed = true; }
    assert.equal(failed, true, 'request unexpectedly succeeded despite unreachable explicit proxy');
    process.stdout.write('unreachable explicit proxy failed closed\n');
  } else {
    throw new Error(`unknown scenario: ${scenario}`);
  }
} else {
  const proxyPort = await listen(proxy);
  const originPort = await listen(origin);
  const originUrl = `http://127.0.0.1:${originPort}`;
  const proxyUrl = `http://127.0.0.1:${proxyPort}`;
  const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-subagents-proxy-verify-'));
  try {
    await writeFile(path.join(agentDir, 'settings.json'), JSON.stringify({ httpProxy: proxyUrl }), 'utf8');
    const beforeProxy = tunnelTargets.length;
    const beforeOrigin = requests.length;
    const positive = await runChild('settings-proxy', agentDir, originUrl);
    assert.deepEqual(requests.slice(beforeOrigin), ['/http', '/events', '/socket']);
    assert.ok(tunnelTargets.length > beforeProxy, 'settings.httpProxy did not establish a CONNECT tunnel');
    assert.ok(tunnelTargets.slice(beforeProxy).every((target) => target === `127.0.0.1:${originPort}`), 'proxy tunnel targeted an unexpected host');
    assert.deepEqual(proxiedRequests.slice(beforeOrigin), ['/http', '/events', '/socket'], 'one or more HTTP/SSE/WebSocket requests did not traverse the CONNECT tunnel');
    process.stdout.write(`PASS settings.httpProxy: ${positive.stdout.trim()} (CONNECT=${tunnelTargets.length - beforeProxy})\n`);

    const directBeforeProxy = tunnelTargets.length;
    const directBeforeProxiedRequests = proxiedRequests.length;
    const directBeforeOrigin = requests.length;
    const direct = await runChild('no-proxy', agentDir, originUrl);
    assert.deepEqual(requests.slice(directBeforeOrigin), ['/direct']);
    assert.equal(tunnelTargets.length, directBeforeProxy, 'NO_PROXY request unexpectedly used the proxy');
    assert.equal(proxiedRequests.length, directBeforeProxiedRequests, 'NO_PROXY request unexpectedly traversed the proxy');
    process.stdout.write(`PASS NO_PROXY: ${direct.stdout.trim()}\n`);

    const badPort = await reserveThenReleasePort();
    const badUrl = `http://127.0.0.1:${badPort}`;
    const failureBeforeOrigin = requests.length;
    const failedClosed = await runChild('bad-explicit-proxy', agentDir, originUrl, badUrl);
    assert.deepEqual(requests.slice(failureBeforeOrigin), [], 'origin received request despite configured proxy failure');
    process.stdout.write(`PASS bad explicit proxy: ${failedClosed.stdout.trim()} (origin direct requests=0)\n`);
    process.stdout.write(`Total local CONNECT tunnels: ${tunnelTargets.length}\n`);
  } finally {
    process.stdout.write(`Retained test settings directory: ${agentDir}\n`);
    await close(proxy);
    await close(origin);
  }
}
