import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { startBackgroundMcp, backgroundMcpPlugin, READY_TOOL } from '../src/background-mcp.mjs';
import { TOOL_NAMES } from '../src/runtime.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const expected = TOOL_NAMES.map(name => `mcp__windows__${name}`);
function fixture() {
  const tools = new Map(), sections = new Map(), effects = [], hooks = [], errors = [];
  let desktopCalls = 0;
  const ctx = {
    fiber: { uid: 1 },
    effect(create) { effects.push(create()); },
    on(event, callback) { hooks.push({ event, callback }); },
    logger: { error: message => errors.push(message) },
    tools: {
      register(tool) {
        if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
        tools.set(tool.name, tool);
        effects.push(() => tools.delete(tool.name));
      },
      get: name => tools.get(name),
    },
    systemPrompt: {
      section(section) { sections.set(section.name, section); effects.push(() => sections.delete(section.name)); },
      async assemble() { return { tools: [...tools.keys()], sections: [...sections.values()] }; },
    },
  };
  const registerDesktop = (names = expected) => {
    for (const name of names) ctx.tools.register({ name, execute() { desktopCalls++; } });
  };
  return {
    ctx, tools, sections, hooks, errors, registerDesktop,
    desktopCalls: () => desktopCalls,
    ready: signal => tools.get(READY_TOOL).execute({}, { signal: signal ?? new AbortController().signal }),
    dispose() {
      ctx.fiber.uid = null;
      for (const hook of hooks) if (hook.event === 'internal/plugin') hook.callback(ctx.fiber);
      effects.reverse().forEach(dispose => dispose?.());
    },
  };
}

test('boot and ordinary model requests proceed while desktop initialization is pending', async () => {
  const f = fixture(), connect = deferred();
  const plugin = backgroundMcpPlugin({ async apply() { await connect.promise; f.registerDesktop(); } });
  await plugin.apply(f.ctx, { serverName: 'windows', failOnStartupError: true });
  const early = await f.ctx.systemPrompt.assemble();
  assert.deepEqual(early.tools, [READY_TOOL]);
  assert(!f.hooks.some(hook => ['system-prompt/assemble', 'agent/pre-step'].includes(hook.event)));
  let desktopReady = false;
  const waiting = f.ready().then(result => { desktopReady = true; return result; });
  await flush();
  assert.equal(desktopReady, false);
  assert.deepEqual((await f.ctx.systemPrompt.assemble()).tools, [READY_TOOL]);
  connect.resolve();
  assert.deepEqual(await waiting, { ready: true, tools: expected });
  assert.deepEqual((await f.ctx.systemPrompt.assemble()).tools.sort(), [...expected, READY_TOOL].sort());
  assert.equal(f.desktopCalls(), 0, 'readiness must not invoke any desktop operation');
  f.dispose();
});

test('canceling one readiness check preserves shared initialization and other callers', async () => {
  const f = fixture(), connect = deferred(), abort = new AbortController();
  startBackgroundMcp(f.ctx, { serverName: 'windows' }, async () => { await connect.promise; f.registerDesktop(); });
  const canceled = f.ready(abort.signal), other = f.ready();
  abort.abort(new Error('request canceled'));
  await assert.rejects(canceled, /request canceled/);
  assert.equal(getEventListeners(abort.signal, 'abort').length, 0);
  connect.resolve();
  assert.equal((await other).ready, true);
  f.dispose();
});

test('initialization failure affects desktop readiness only and native reconnect may recover', async () => {
  const f = fixture();
  const { settled } = startBackgroundMcp(f.ctx, { serverName: 'windows' }, async () => { throw new Error('fixture failure'); });
  await settled;
  await assert.rejects(f.ready(), /initialization failed/);
  assert.deepEqual((await f.ctx.systemPrompt.assemble()).tools, [READY_TOOL]);
  assert.equal(f.errors.length, 1);
  f.registerDesktop();
  assert.deepEqual((await f.ready()).tools, expected);
  f.dispose();
});

test('missing or subsequently disconnected tools cannot be reported as ready', async () => {
  const f = fixture();
  const { settled } = startBackgroundMcp(f.ctx, { serverName: 'windows' }, async () => f.registerDesktop(expected.slice(0, 8)));
  await settled;
  await assert.rejects(f.ready(), /unavailable/);
  f.registerDesktop(expected.slice(8));
  assert.equal((await f.ready()).ready, true);
  f.tools.delete(expected[0]);
  await assert.rejects(f.ready(), /disconnected/);
  f.dispose();
});

test('disable cancels pending readiness, releases native effects and removes contributions', async () => {
  const f = fixture(), connect = deferred();
  let cleanup = 0;
  const { settled } = startBackgroundMcp(f.ctx, { serverName: 'windows' }, async native => {
    native.effect(() => () => { cleanup++; connect.resolve(); });
    await connect.promise;
  });
  const pending = f.ready();
  await flush();
  f.dispose();
  await assert.rejects(pending, /stopped/);
  await settled;
  assert.equal(cleanup, 1);
  assert.equal(f.tools.size, 0);
  assert.equal(f.sections.size, 0);
});

test('disable before background work starts cannot launch the MCP process', async () => {
  const f = fixture();
  let starts = 0;
  const { settled } = startBackgroundMcp(f.ctx, { serverName: 'windows' }, () => { starts++; });
  f.dispose();
  await settled;
  assert.equal(starts, 0);
  assert.equal(f.errors.length, 0);
});
