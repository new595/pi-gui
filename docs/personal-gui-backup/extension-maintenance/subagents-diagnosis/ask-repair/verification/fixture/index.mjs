import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "file:///C:/Users/lwj/.pi/agent/npm/node_modules/jiti/lib/jiti.mjs";

const jiti = createJiti(import.meta.url);
const packageRoot = "C:/Users/lwj/.pi/agent/npm/node_modules/@juicesharp/rpiv-ask-user-question";
const outputDir = process.env.PI_EXT_VERIFY_DIR;
const registeredTools = new Map();
const askEvents = [];

function captureRegistrationAndForward(pi) {
  return new Proxy(pi, {
    get(target, key, receiver) {
      if (key === "registerTool") {
        return (tool) => {
          registeredTools.set(tool.name, tool);
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

const module = await jiti.import(pathToFileURL(join(packageRoot, "index.ts")).href);
const factory = module.default;
if (typeof factory !== "function") throw new Error("Installed ask-user-question factory missing");

export default function register(pi) {
  factory(captureRegistrationAndForward(pi));
  if (!registeredTools.has("ask_user_question")) throw new Error("Real factory did not register ask_user_question");
  pi.events.on("rpiv:ask-user:prompt", (payload) => askEvents.push({ type: "prompt", payload }));
  pi.events.on("rpiv:ask-user:blocked", (payload) => askEvents.push({ type: "blocked", payload }));

  const questions = {
    single: [{ question: "GUI fixture: choose one", header: "Single", options: [{ label: "Alpha", description: "First choice" }, { label: "Beta", description: "Second choice" }] }],
    custom: [{ question: "GUI fixture: custom answer", header: "Custom", options: [{ label: "Red", description: "Warm color" }, { label: "Blue", description: "Cool color" }] }],
    multi: [{ question: "GUI fixture: choose indices", header: "Multi", multiSelect: true, options: [{ label: "One", description: "First" }, { label: "Two", description: "Second" }, { label: "Three", description: "Third" }] }],
    cancel: [{ question: "GUI fixture: cancel this", header: "Cancel", options: [{ label: "Continue", description: "Continue" }, { label: "Stop", description: "Stop" }] }],
    sequenceA: [{ question: "GUI fixture: first sequential call", header: "Sequence A", options: [{ label: "A1", description: "First" }, { label: "A2", description: "Second" }] }],
    sequenceB: [{ question: "GUI fixture: second sequential call", header: "Sequence B", options: [{ label: "B1", description: "First" }, { label: "B2", description: "Second" }] }],
    secondCancel: [
      { question: "GUI fixture: answer before cancel", header: "Two Q 1", options: [{ label: "Keep", description: "Keep" }, { label: "Change", description: "Change" }] },
      { question: "GUI fixture: cancel second question", header: "Two Q 2", options: [{ label: "Later", description: "Later" }, { label: "Now", description: "Now" }] },
    ],
  };

  for (const [scenario, items] of Object.entries(questions)) {
    pi.registerCommand(`verify-ask-${scenario.toLowerCase()}`, {
      description: `Run installed ask_user_question GUI case ${scenario}`,
      handler: async (_args, ctx) => {
        try {
          const tool = registeredTools.get("ask_user_question");
          const result = await tool.execute(`gui-${scenario}`, { questions: items }, new AbortController().signal, () => {}, ctx);
          await save(scenario.toLowerCase(), { result, askEvents: [...askEvents] });
          ctx.ui.notify(`ask GUI ${scenario}: returned`, "info");
        } catch (error) {
          await save(scenario.toLowerCase(), { error: error instanceof Error ? error.message : String(error), code: error?.code ?? null, askEvents: [...askEvents] });
          ctx.ui.notify(`ask GUI ${scenario}: error`, "error");
        }
      },
    });
  }
}
