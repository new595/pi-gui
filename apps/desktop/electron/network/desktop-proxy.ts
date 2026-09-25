import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EnvHttpProxyAgent, install, setGlobalDispatcher } from "undici";
import type { ProxyStatusSnapshot } from "../../contracts/proxy-status";

export interface DesktopProxyOptions {
  readonly httpProxy: string;
  readonly httpsProxy: string;
  readonly noProxy: string;
}

export interface InitializeDesktopProxyOptions {
  readonly agentDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}

const INVALID_EXPLICIT_PROXY =
  "Invalid httpProxy in Pi settings: expected a valid http:// or https:// proxy URL.";
const SETTINGS_READ_ERROR = "Unable to read Pi proxy settings.";
const SETTINGS_PARSE_ERROR = "Pi proxy settings contain invalid JSON.";

type ProxyConfigErrorKind = "explicit" | "http-env" | "https-env" | "parse" | "read" | "dispatcher";
class DesktopProxyConfigError extends Error {
  constructor(readonly kind: ProxyConfigErrorKind) {
    super(
      kind === "explicit"
        ? INVALID_EXPLICIT_PROXY
        : kind === "http-env"
          ? "Invalid HTTP_PROXY environment value: expected a valid http:// or https:// proxy URL."
          : kind === "https-env"
            ? "Invalid HTTPS_PROXY environment value: expected a valid http:// or https:// proxy URL."
            : kind === "parse"
              ? SETTINGS_PARSE_ERROR
              : kind === "read"
                ? SETTINGS_READ_ERROR
                : "Unable to initialize the configured proxy. Check Pi settings and proxy environment configuration.",
    );
    this.name = "DesktopProxyConfigError";
  }
}
let effectiveStatus: ProxyStatusSnapshot | undefined;
let configuredSettingsPath: string | undefined;

export function getDesktopProxySettingsPath(): string | undefined {
  return configuredSettingsPath;
}

export function getDesktopProxyStartupErrorMessage(error: unknown): string {
  return error instanceof DesktopProxyConfigError
    ? error.message
    : "Unable to initialize proxy settings. Check Pi settings and proxy environment variables.";
}

function safeOrigin(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getDesktopProxyStatus(): ProxyStatusSnapshot {
  if (!effectiveStatus) {
    throw new Error("Desktop proxy status is unavailable before initialization completes.");
  }
  return effectiveStatus;
}

function getEnvironmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  // Windows environment names are case-insensitive in practice. Prefer the
  // conventional upper-case spelling when both spellings are present.
  const upper = env[name.toUpperCase()];
  const lower = env[name.toLowerCase()];
  const value = upper ?? lower;
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function validateProxyUrl(value: string, kind: ProxyConfigErrorKind): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DesktopProxyConfigError(kind);
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
    throw new DesktopProxyConfigError(kind);
  }
  return value;
}

function validateEnvironmentProxy(
  value: string | undefined,
  kind: "http-env" | "https-env",
): string {
  if (!value) return "";
  return validateProxyUrl(value, kind);
}

/**
 * Resolve the Pi setting and environment proxy variables without mutating
 * process.env. Empty strings are intentional: they prevent Undici from
 * falling back to ambient environment values after this snapshot is taken.
 */
export function resolveDesktopProxyOptions(
  settings: unknown,
  env: NodeJS.ProcessEnv,
): DesktopProxyOptions {
  const noProxy = getEnvironmentValue(env, "NO_PROXY") ?? "";

  let explicitProxy: string | undefined;
  if (settings !== null && typeof settings === "object" && !Array.isArray(settings)) {
    const setting = (settings as Record<string, unknown>).httpProxy;
    if (setting !== undefined) {
      if (typeof setting !== "string") {
        throw new DesktopProxyConfigError("explicit");
      }
      const trimmed = setting.trim();
      if (trimmed) {
        explicitProxy = validateProxyUrl(trimmed, "explicit");
      }
    }
  }

  if (explicitProxy) {
    return {
      httpProxy: explicitProxy,
      httpsProxy: explicitProxy,
      noProxy,
    };
  }

  const httpEnvironmentProxy = validateEnvironmentProxy(
    getEnvironmentValue(env, "HTTP_PROXY"),
    "http-env",
  );
  const httpsEnvironmentProxy = validateEnvironmentProxy(
    getEnvironmentValue(env, "HTTPS_PROXY"),
    "https-env",
  );
  return {
    httpProxy: httpEnvironmentProxy,
    // Undici falls back to httpProxy for HTTPS when httpsProxy is empty, which
    // matches the documented HTTP_PROXY-only behavior.
    httpsProxy: httpsEnvironmentProxy,
    noProxy,
  };
}

export function createDesktopProxyDispatcher(
  settings: unknown,
  env: NodeJS.ProcessEnv,
): EnvHttpProxyAgent {
  const options = resolveDesktopProxyOptions(settings, env);
  try {
    return new EnvHttpProxyAgent({
      ...options,
      // Keep HTTP origins on CONNECT tunnels, matching Pi's own configured
      // dispatcher and avoiding the forward-proxy path for successive requests.
      proxyTunnel: true,
    });
  } catch {
    // Constructor diagnostics may echo a proxy URI, including credentials.
    throw new DesktopProxyConfigError("dispatcher");
  }
}

async function readGlobalSettings(agentDir: string): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(join(agentDir, "settings.json"), "utf8");
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw new DesktopProxyConfigError("read");
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new DesktopProxyConfigError("parse");
  }
}

/** Read Pi's global settings and install the proxy for Undici fetch and WebSocket. */
export async function initializeDesktopProxy(
  options: InitializeDesktopProxyOptions = {},
): Promise<EnvHttpProxyAgent> {
  const agentDir =
    options.agentDir ?? (await import("@earendil-works/pi-coding-agent")).getAgentDir();
  configuredSettingsPath = join(agentDir, "settings.json");
  const settings = await readGlobalSettings(agentDir);
  const env = options.env ?? process.env;
  const resolved = resolveDesktopProxyOptions(settings, env);
  const explicit =
    settings !== null &&
    typeof settings === "object" &&
    !Array.isArray(settings) &&
    typeof (settings as Record<string, unknown>).httpProxy === "string" &&
    Boolean(((settings as Record<string, unknown>).httpProxy as string).trim());
  const environment = Boolean(
    getEnvironmentValue(env, "HTTP_PROXY") || getEnvironmentValue(env, "HTTPS_PROXY"),
  );
  const status: ProxyStatusSnapshot = {
    source: explicit ? "pi-settings" : environment ? "environment" : "direct",
    httpProxy: safeOrigin(resolved.httpProxy),
    httpsProxy: safeOrigin(resolved.httpsProxy || resolved.httpProxy),
    noProxy: resolved.noProxy,
    settingsPath: configuredSettingsPath,
  };
  const dispatcher = createDesktopProxyDispatcher(settings, env);
  setGlobalDispatcher(dispatcher);
  install();
  effectiveStatus = status;
  return dispatcher;
}
