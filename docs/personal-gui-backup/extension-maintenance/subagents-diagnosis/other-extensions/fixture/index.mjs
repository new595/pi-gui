import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "file:///C:/Users/lwj/.pi/agent/npm/node_modules/jiti/lib/jiti.mjs";

const jiti = createJiti(import.meta.url);
const root = "C:/Users/lwj/.pi/agent/npm/node_modules";
const outputDir = process.env.PI_EXT_VERIFY_DIR;
const captured = new Map();
const registration = {};
const factories = new Map();

function capturePi(pi, owner) {
  return new Proxy(pi, {
    get(target, key, receiver) {
      if (key === "registerTool") {
        return (tool) => {
          captured.set(`${owner}:${tool.name}`, tool);
          return target.registerTool(tool);
        };
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function save(name, value) {
  if (!outputDir) return;
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadFactory(owner, entry, isNative = false) {
  try {
    const module = isNative
      ? await import(pathToFileURL(entry).href)
      : await jiti.import(pathToFileURL(entry).href);
    const factory = module.default;
    if (typeof factory !== "function") throw new Error("Missing extension factory");
    factories.set(owner, factory);
  } catch (error) {
    registration[owner] = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

await loadFactory("pwsh", `${root}/@4fu/pi-pwsh/src/index.ts`);
await loadFactory("todo", `${root}/@juicesharp/rpiv-todo/index.ts`);
await loadFactory("ask", `${root}/@juicesharp/rpiv-ask-user-question/index.ts`);
await loadFactory("web", `${root}/pi-web-access/dist/index.js`, true);

export default function register(pi) {
  for (const [owner, factory] of factories) {
    try {
      factory(capturePi(pi, owner));
      registration[owner] = { ok: true, tools: [...captured.keys()].filter((key) => key.startsWith(`${owner}:`)) };
    } catch (error) {
      registration[owner] = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  void save("registration", registration);
  pi.registerCommand("verify-pwsh", {
    description: "Verify installed pwsh tool in an isolated profile",
    handler: async (_args, ctx) => {
      const tool = captured.get("pwsh:pwsh");
      if (!tool) return save("pwsh", { ok: false, reason: "tool not registered" });
      const controller = new AbortController();
      try {
        const result = await tool.execute("fixture-pwsh", { command: "Write-Output GUI_EXT_OK", wait: 10 }, controller.signal, () => {}, ctx);
        const output = result.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") ?? "";
        const ok = output.includes("GUI_EXT_OK");
        await save("pwsh", { ok, markerFound: ok, resultTextTail: output.slice(-500) });
        ctx.ui.notify(`verify-pwsh: ${ok ? "pass" : "fail"}`, ok ? "info" : "error");
      } catch (error) {
        await save("pwsh", { ok: false, error: error instanceof Error ? error.message : String(error) });
        ctx.ui.notify("verify-pwsh: error", "error");
      }
    },
  });

  pi.registerCommand("verify-todo", {
    description: "Verify installed todo tool in an isolated profile",
    handler: async (_args, ctx) => {
      const tool = captured.get("todo:todo");
      if (!tool) return save("todo", { ok: false, reason: "tool not registered" });
      try {
        const create = await tool.execute("fixture-todo-create", { action: "create", subject: "GUI_EXT_TODO" }, new AbortController().signal, () => {}, ctx);
        const list = await tool.execute("fixture-todo-list", { action: "list" }, new AbortController().signal, () => {}, ctx);
        const text = JSON.stringify({ create: create.content, list: list.content });
        const ok = text.includes("GUI_EXT_TODO");
        await save("todo", { ok, markerFound: ok, createTaskCount: create.details?.tasks?.length ?? null, listTaskCount: list.details?.tasks?.length ?? null });
        ctx.ui.notify(`verify-todo: ${ok ? "pass" : "fail"}`, ok ? "info" : "error");
      } catch (error) {
        await save("todo", { ok: false, error: error instanceof Error ? error.message : String(error) });
        ctx.ui.notify("verify-todo: error", "error");
      }
    },
  });

  pi.registerCommand("verify-ask", {
    description: "Verify installed ask_user_question GUI UI path",
    handler: async (_args, ctx) => {
      const tool = captured.get("ask:ask_user_question");
      if (!tool) return save("ask", { ok: false, reason: "tool not registered" });
      try {
        const result = await tool.execute("fixture-ask", { questions: [{ question: "Choose a fixture option?", header: "Fixture", options: [{ label: "A", description: "First" }, { label: "B", description: "Second" }] }] }, new AbortController().signal, () => {}, ctx);
        await save("ask", { ok: true, resultText: JSON.stringify(result.content).slice(0, 500) });
        ctx.ui.notify("verify-ask: returned", "info");
      } catch (error) {
        await save("ask", { ok: false, error: error instanceof Error ? error.message : String(error), code: error?.code ?? null });
        ctx.ui.notify("verify-ask: unsupported GUI UI", "warning");
      }
    },
  });

  pi.registerCommand("verify-web", {
    description: "Verify public fetch_content without model or account",
    handler: async (_args, ctx) => {
      const tool = captured.get("web:fetch_content");
      if (!tool) return save("web", { ok: false, reason: "tool not registered" });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const result = await tool.execute("fixture-web", { url: "https://example.com", mode: "raw", proxy: "" }, controller.signal, () => {}, ctx);
        const text = result.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") ?? "";
        const ok = text.includes("Example Domain");
        await save("web", { ok, markerFound: ok, error: result.details?.error ?? null, textHead: text.slice(0, 300) });
        ctx.ui.notify(`verify-web: ${ok ? "pass" : "fail"}`, ok ? "info" : "error");
      } catch (error) {
        await save("web", { ok: false, error: error instanceof Error ? error.message : String(error) });
        ctx.ui.notify("verify-web: error", "error");
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
