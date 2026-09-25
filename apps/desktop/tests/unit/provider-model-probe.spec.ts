import { expect, test } from "@playwright/test";
import { createJiti } from "jiti";

const jiti = createJiti(__filename);
let probeCustomProviderModels: typeof import("../../electron/network/provider-model-probe").probeCustomProviderModels;
test.beforeAll(async () => {
  ({ probeCustomProviderModels } = await jiti.import<
    typeof import("../../electron/network/provider-model-probe")
  >("../../electron/network/provider-model-probe.ts"));
});

test("model probe sends the models GET with Bearer auth and keeps usable IDs", async () => {
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ data: [{ id: "a" }, { id: "" }, {}, { id: "b" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  await expect(
    probeCustomProviderModels(
      { baseUrl: "http://provider.example/v1/", apiKey: " key " },
      fetchImpl,
    ),
  ).resolves.toEqual({ ok: true, models: ["a", "b"] });
  expect(requestedUrl).toBe("http://provider.example/v1/models");
  expect(requestInit?.method).toBe("GET");
  expect(new Headers(requestInit?.headers).get("authorization")).toBe("Bearer key");
  expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
});

test("model probe validates the base URL and reports response contracts", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ models: [] }), { status: 200 });
  await expect(probeCustomProviderModels({ baseUrl: "file:///tmp" }, fetchImpl)).resolves.toEqual({
    ok: false,
    error: "Base URL must start with http:// or https://",
  });
  await expect(
    probeCustomProviderModels({ baseUrl: "http://provider.example/v1" }, fetchImpl),
  ).resolves.toMatchObject({
    ok: false,
    error: 'Response from http://provider.example/v1/models is missing a "data" array',
  });
  await expect(
    probeCustomProviderModels(
      { baseUrl: "http://user:secret@provider.example/v1" },
      async () => new Response("unavailable", { status: 502, statusText: "Bad Gateway" }),
    ),
  ).resolves.toMatchObject({
    ok: false,
    error: "502 Provider service error at http://provider.example/v1/models. Try again later.",
  });
});

test("model probe gives actionable authentication, proxy, and rate-limit errors", async () => {
  for (const [status, expected] of [
    [401, "Authentication or permission failed"],
    [403, "Authentication or permission failed"],
    [407, "Proxy authentication required"],
    [429, "Provider rate limit reached"],
    [503, "Provider service error"],
  ] as const) {
    const result = await probeCustomProviderModels(
      { baseUrl: "http://user:secret@provider.example/v1?token=hidden" },
      async () => new Response("", { status }),
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain(expected);
      expect(result.error).not.toContain("secret");
      expect(result.error).not.toContain("hidden");
    }
  }
});

test("model probe describes TLS and timeout failures without exposing nested causes", async () => {
  for (const [name, code, expected] of [
    ["TimeoutError", undefined, "Timed out after 5s"],
    ["TypeError", "ERR_TLS_CERT_ALTNAME_INVALID", "Could not verify the TLS certificate"],
    ["TypeError", "ETIMEDOUT", "Timed out contacting"],
  ] as const) {
    const error = Object.assign(new Error("secret-url-with-creds"), {
      name,
      cause: { code, message: "private details" },
    });
    const result = await probeCustomProviderModels(
      { baseUrl: "http://provider.example" },
      async () => {
        throw error;
      },
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain(expected);
      expect(result.error).not.toContain("secret-url");
      expect(result.error).not.toContain("private details");
    }
  }
});

test("model probe hides credentials when fetch fails", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new TypeError("fetch failed: http://proxy-user:proxy-secret@proxy.example:8080");
  };
  const result = await probeCustomProviderModels(
    { baseUrl: "http://provider-user:provider-secret@provider.example/v1", apiKey: "token-secret" },
    fetchImpl,
  );
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).not.toContain("proxy-secret");
    expect(result.error).not.toContain("provider-secret");
    expect(result.error).not.toContain("token-secret");
  }
});
