import { isValidHttpBaseUrl } from "@pi-gui/pi-sdk-driver";
import type { CustomProviderProbeInput, CustomProviderProbeResult } from "../../contracts/ipc";

/** Fetch the model list for a custom provider through the configured Node fetch. */
export async function probeCustomProviderModels(
  input: CustomProviderProbeInput,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CustomProviderProbeResult> {
  const baseUrl = input.baseUrl?.trim();
  if (!baseUrl || !isValidHttpBaseUrl(baseUrl)) {
    return { ok: false, error: "Base URL must start with http:// or https://" };
  }

  const requestTarget = `${baseUrl.replace(/\/+$/, "")}/models`;
  const displayTarget = redactUrlCredentials(requestTarget);
  const apiKey = input.apiKey?.trim();

  try {
    const response = await fetchImpl(requestTarget, {
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `${response.status} ${response.statusText} from ${displayTarget}`,
      };
    }

    const payload = (await response.json()) as unknown;
    const data = (payload as { data?: unknown }).data;
    if (!Array.isArray(data)) {
      return {
        ok: false,
        error: `Response from ${displayTarget} is missing a "data" array`,
      };
    }

    const models = data
      .map((entry) => {
        if (
          entry &&
          typeof entry === "object" &&
          typeof (entry as { id?: unknown }).id === "string"
        ) {
          return (entry as { id: string }).id;
        }
        return undefined;
      })
      .filter((id): id is string => Boolean(id && id.length > 0));
    return { ok: true, models };
  } catch (error) {
    return { ok: false, error: describeProbeError(error, displayTarget) };
  }
}

function redactUrlCredentials(target: string): string {
  try {
    const url = new URL(target);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "the configured provider URL";
  }
}

function describeProbeError(error: unknown, target: string): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return `Timed out after 5s contacting ${target}`;
  }

  const code = getSafeNetworkErrorCode(error);
  if (code === "ECONNREFUSED") {
    return `Could not connect to ${target}. Check the provider or proxy address and try again.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `Could not resolve the provider host for ${target}. Check the network or proxy settings and try again.`;
  }
  if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return `Could not verify the TLS certificate for ${target}. Check the provider or proxy certificate settings.`;
  }
  return `Could not reach ${target}. Check the provider URL, network, or proxy settings and try again.`;
}

function getSafeNetworkErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const directCode = (error as { code?: unknown }).code;
  if (typeof directCode === "string" && SAFE_NETWORK_ERROR_CODES.has(directCode)) {
    return directCode;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") {
    return undefined;
  }
  const causeCode = (cause as { code?: unknown }).code;
  return typeof causeCode === "string" && SAFE_NETWORK_ERROR_CODES.has(causeCode)
    ? causeCode
    : undefined;
}

const SAFE_NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
