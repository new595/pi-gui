import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { getConfigDirName } from "../../shared/utils.js";
/** Pi's default undici header/body idle timeout. */
export const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000;
/**
 * Mirrors pi-coding-agent's `parseHttpIdleTimeoutMs`: numbers (or numeric
 * strings) are floored, `"disabled"` means 0, anything else is invalid.
 */
export function parseHttpIdleTimeoutMs(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.toLowerCase() === "disabled")
            return 0;
        if (trimmed.length === 0)
            return undefined;
        return parseHttpIdleTimeoutMs(Number(trimmed));
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        return undefined;
    return Math.floor(value);
}
function readSetting(file) {
    let raw;
    try {
        raw = fs.readFileSync(file, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return { present: false };
        return { present: false, error: `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}` };
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return { present: false };
        if (!Object.hasOwn(parsed, "httpIdleTimeoutMs"))
            return { present: false };
        return { present: true, value: parsed.httpIdleTimeoutMs };
    }
    catch (error) {
        return { present: false, error: `cannot parse ${file}: ${error instanceof Error ? error.message : String(error)}` };
    }
}
/**
 * Resolves Pi's `httpIdleTimeoutMs` the way the host does: the project
 * `.pi/settings.json` overrides the global `<agentDir>/settings.json`, and an
 * unset value falls back to 300 000 ms. Detached runners install their own
 * undici dispatcher before pi-coding-agent is loaded, so they cannot borrow
 * Pi's SettingsManager and must read the setting themselves.
 */
export function resolveHttpIdleTimeoutMs(options) {
    const candidates = [
        { source: "project", file: path.join(options.cwd, getConfigDirName(), "settings.json") },
        { source: "global", file: path.join(options.agentDir, "settings.json") },
    ];
    const warnings = [];
    for (const candidate of candidates) {
        const read = readSetting(candidate.file);
        if (read.error) {
            warnings.push(read.error);
            continue;
        }
        if (!read.present)
            continue;
        const timeoutMs = parseHttpIdleTimeoutMs(read.value);
        if (timeoutMs === undefined) {
            // Pi rejects the merged value outright; a malformed override must not
            // silently fall through to a different scope's setting.
            warnings.push(`invalid httpIdleTimeoutMs in ${candidate.file}: ${String(read.value)}`);
            return { timeoutMs: DEFAULT_HTTP_IDLE_TIMEOUT_MS, source: "default", warning: warnings.join("; ") };
        }
        return { timeoutMs, source: candidate.source, ...(warnings.length ? { warning: warnings.join("; ") } : {}) };
    }
    return { timeoutMs: DEFAULT_HTTP_IDLE_TIMEOUT_MS, source: "default", ...(warnings.length ? { warning: warnings.join("; ") } : {}) };
}
/** Dispatcher options shared by the runner and its regression test. */
export function runnerHttpDispatcherOptions(timeoutMs) {
    return {
        allowH2: false,
        // Keep HTTP origins on CONNECT tunnels, matching Pi's dispatcher.
        proxyTunnel: true,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
    };
}
function getEnvironmentValue(env, name) {
    const value = env[name.toUpperCase()] ?? env[name.toLowerCase()];
    return typeof value === "string" ? value.trim() || undefined : undefined;
}
function validateProxyUrl(value, source) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new Error(`Invalid ${source}: expected a valid http:// or https:// proxy URL.`);
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname)
        throw new Error(`Invalid ${source}: expected a valid http:// or https:// proxy URL.`);
    return value;
}
function readGlobalProxySetting(agentDir) {
    let raw;
    try {
        raw = fs.readFileSync(path.join(agentDir, "settings.json"), "utf8");
    }
    catch (error) {
        if (error?.code === "ENOENT")
            return {};
        throw new Error("Unable to read Pi proxy settings.");
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error("Pi proxy settings contain invalid JSON.");
    }
}
/** Match the desktop proxy's global setting and environment precedence. */
function resolveRunnerProxyOptions(settings, env) {
    const noProxy = getEnvironmentValue(env, "NO_PROXY") ?? "";
    let explicitProxy;
    if (settings !== null && typeof settings === "object" && !Array.isArray(settings)) {
        const setting = settings.httpProxy;
        if (setting !== undefined) {
            if (typeof setting !== "string")
                throw new Error("Invalid httpProxy in Pi settings: expected a valid http:// or https:// proxy URL.");
            const trimmed = setting.trim();
            if (trimmed)
                explicitProxy = validateProxyUrl(trimmed, "httpProxy in Pi settings");
        }
    }
    if (explicitProxy)
        return { httpProxy: explicitProxy, httpsProxy: explicitProxy, noProxy };
    const httpProxy = getEnvironmentValue(env, "HTTP_PROXY");
    const httpsProxy = getEnvironmentValue(env, "HTTPS_PROXY");
    return {
        httpProxy: httpProxy ? validateProxyUrl(httpProxy, "HTTP_PROXY environment value") : "",
        httpsProxy: httpsProxy ? validateProxyUrl(httpsProxy, "HTTPS_PROXY environment value") : "",
        noProxy,
    };
}
function setRunnerEnvironmentProxy(proxy) {
    // Bun's native WebSocket can read environment proxy variables directly.
    // Keep this normalization inside the detached runner process only.
    for (const [name, value] of [["HTTP_PROXY", proxy.httpProxy], ["HTTPS_PROXY", proxy.httpsProxy || proxy.httpProxy], ["NO_PROXY", proxy.noProxy]]) {
        for (const key of [name, name.toLowerCase()]) {
            if (value)
                process.env[key] = value;
            else
                delete process.env[key];
        }
    }
    delete process.env.ALL_PROXY;
    delete process.env.all_proxy;
}
/**
 * Installs the runner's proxy-aware undici dispatcher as the process global and
 * routes global fetch through it, with header/body idle clocks taken from Pi's
 * `httpIdleTimeoutMs`. Detached runners skip Pi's CLI dispatcher setup: the Node
 * entrypoint never runs it, and the binary bootstrap runs inside the extension
 * factory, before Pi applies the setting to its own dispatcher. Configuration
 * errors propagate so an explicit proxy cannot silently fall back to direct.
 */
export function installRunnerHttpDispatcher(options) {
    const proxy = resolveRunnerProxyOptions(readGlobalProxySetting(options.agentDir), process.env);
    // SAFETY: require loads the pinned direct dependency described by these types.
    const undici = createRequire(import.meta.url)("undici");
    const idle = resolveHttpIdleTimeoutMs(options);
    if (idle.warning)
        console.error(`[pi-subagents] httpIdleTimeoutMs: ${idle.warning}; using ${idle.timeoutMs}ms`);
    let dispatcher;
    try {
        dispatcher = new undici.EnvHttpProxyAgent({ ...runnerHttpDispatcherOptions(idle.timeoutMs), ...proxy });
    }
    catch {
        // Undici's diagnostics can include credentials from the proxy URL.
        throw new Error("Unable to initialize the configured proxy. Check Pi settings and proxy environment configuration.");
    }
    // Fetch rejects stream errors; the listener prevents an unhandled EventEmitter error.
    EventEmitter.prototype.on.call(dispatcher, "error", () => { });
    undici.setGlobalDispatcher(dispatcher);
    undici.install();
    if (globalThis.Bun)
        setRunnerEnvironmentProxy(proxy);
}
