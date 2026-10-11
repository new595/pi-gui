import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createJiti } from 'file:///C:/Users/lwj/.pi/agent/npm/node_modules/jiti/lib/jiti.mjs';

const jiti = createJiti(import.meta.url);
const { registerAskUserQuestionTool } = await jiti.import('C:/Users/lwj/.pi/agent/npm/node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts');
const params = { questions: [{ question: 'Boundary fixture?', header: 'Fixture', options: [{ label: 'A', description: 'First' }, { label: 'B', description: 'Second' }] }] };
const prefix = '__PI_GUI_UNSUPPORTED_HOST_UI__:';
const unsupported = () => new Error(prefix + JSON.stringify({ capability: 'custom', classification: 'terminal-only' }));
const results = [];
function setup(custom, overrides = {}) {
  let tool;
  const blocked = [];
  let selects = 0;
  let cleaned = 0;
  registerAskUserQuestionTool({ registerTool: (t) => { tool = t; }, events: { emit: (name, value) => { if (name === 'rpiv:ask-user:blocked') blocked.push(value.active); } } });
  const ctx = { hasUI: true, mode: 'print', ui: {
    custom,
    select: async () => { selects++; return '1. A — First'; },
    input: async () => 'custom fixture',
    onTerminalInput: () => () => { cleaned++; },
    ...overrides,
  } };
  return { run: () => tool.execute('boundary', params, new AbortController().signal, () => {}, ctx), blocked, get selects() { return selects; }, get cleaned() { return cleaned; } };
}

const success = setup(async () => { throw unsupported(); });
assert.equal((await success.run()).details.answers[0].answer, 'A');
assert.deepEqual(success.blocked, [true, false]);
assert.equal(success.selects, 1);
results.push('typed GUI rejection uses dialog fallback with paired blocked events');

for (const value of [new Error('ordinary failure'), new Error(prefix + '{invalid'), new Error(prefix + JSON.stringify({ capability: 'editor', classification: 'terminal-only' })), new Error(prefix + JSON.stringify({ capability: 'custom', classification: 'other' })), prefix + '{}']) {
  const c = setup(async () => { throw value; });
  await assert.rejects(c.run(), (error) => error === value);
  assert.equal(c.selects, 0);
  assert.deepEqual(c.blocked, [true, false]);
}
results.push('five unrelated/malformed rejection variants propagate unchanged');

const tui = setup(async () => ({ answers: [{ questionIndex: 0, question: 'Boundary fixture?', kind: 'option', answer: 'B' }], cancelled: false }));
assert.equal((await tui.run()).details.answers[0].answer, 'B');
assert.equal(tui.selects, 0);
results.push('successful custom/TUI path does not use dialogs');

for (const isUndefined of [false, true]) {
  let release;
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const c = setup(async () => { if (isUndefined) return undefined; throw unsupported(); }, { select: async () => { entered(); return pending; } });
  const run = c.run();
  await ready;
  assert.deepEqual(c.blocked, [true]);
  release(undefined);
  assert.equal((await run).details.cancelled, true);
  assert.deepEqual(c.blocked, [true, false]);
}
results.push('both unsupported and undefined fallbacks stay blocked until cancellation completes');

const noDialogs = setup(async () => { throw unsupported(); }, { select: undefined, input: undefined });
assert.equal((await noDialogs.run()).details.error, 'no_custom_ui');
results.push('missing dialog primitives returns existing no_custom_ui result');

await writeFile(new URL('./boundary-results.json', import.meta.url), JSON.stringify({ passed: true, results, scope: 'Targeted mocked boundary/lifecycle checks; actual GUI acceptance is separate.' }, null, 2));
console.log(JSON.stringify({ passed: true, results }, null, 2));
