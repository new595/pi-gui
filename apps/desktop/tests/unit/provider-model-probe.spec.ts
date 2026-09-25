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
    error: "502 Bad Gateway from http://provider.example/v1/models",
  });
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
