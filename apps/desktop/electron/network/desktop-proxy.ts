import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EnvHttpProxyAgent, install, setGlobalDispatcher } from "undici";

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
const INVALID_ENV_PROXY =
  "Invalid proxy environment configuration: expected a valid http:// or https:// proxy URL.";
const SETTINGS_READ_ERROR = "Unable to read Pi proxy settings.";
const SETTINGS_PARSE_ERROR = "Pi proxy settings contain invalid JSON.";

function getEnvironmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  // Windows environment names are case-insensitive in practice. Prefer the
  // conventional upper-case spelling when both spellings are present.
  const upper = env[name.toUpperCase()];
  const lower = env[name.toLowerCase()];
  const value = upper ?? lower;
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function validateProxyUrl(value: string, errorMessage: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(errorMessage);
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
    throw new Error(errorMessage);
  }
  return value;
}

function validateEnvironmentProxy(value: string | undefined): string {
  if (!value) return "";
  return validateProxyUrl(value, INVALID_ENV_PROXY);
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
        throw new Error(INVALID_EXPLICIT_PROXY);
      }
      const trimmed = setting.trim();
      if (trimmed) {
        explicitProxy = validateProxyUrl(trimmed, INVALID_EXPLICIT_PROXY);
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

  const httpEnvironmentProxy = validateEnvironmentProxy(getEnvironmentValue(env, "HTTP_PROXY"));
  const httpsEnvironmentProxy = validateEnvironmentProxy(getEnvironmentValue(env, "HTTPS_PROXY"));
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
    throw new Error(INVALID_ENV_PROXY);
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
    throw new Error(SETTINGS_READ_ERROR);
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(SETTINGS_PARSE_ERROR);
  }
}

/** Read Pi's global settings and install the proxy for Undici fetch and WebSocket. */
export async function initializeDesktopProxy(
  options: InitializeDesktopProxyOptions = {},
): Promise<EnvHttpProxyAgent> {
  const agentDir =
    options.agentDir ?? (await import("@earendil-works/pi-coding-agent")).getAgentDir();
  const settings = await readGlobalSettings(agentDir);
  const dispatcher = createDesktopProxyDispatcher(settings, options.env ?? process.env);
  setGlobalDispatcher(dispatcher);
  install();
  return dispatcher;
}
