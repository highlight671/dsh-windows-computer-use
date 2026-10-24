// Native lifecycle/readiness checks. With --runtime, additionally connects to
// an existing Windows-MCP runtime and calls only ControlStatus (no UI input).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mountPlugin } from '../src/index.mjs';
import { READY_TOOL } from '../src/background-mcp.mjs';
import { createTransport, TOOL_NAMES } from '../src/runtime.mjs';

let stage = 'load native dependencies';
async function main() {
  const options = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i], value = process.argv[i + 1];
    if (!['--host-root', '--runtime'].includes(key) || !value || !path.isAbsolute(value)) {
      throw new Error('Usage: verify-native.mjs [--host-root ABSOLUTE_HOST_PACKAGE_ROOT] [--runtime ABSOLUTE_EXISTING_RUNTIME]');
    }
    options.set(key, value);
  }
  const requireFromHost = options.has('--host-root')
    ? createRequire(path.join(options.get('--host-root'), 'package.json')) : createRequire(import.meta.url);
  const load = specifier => import(pathToFileURL(requireFromHost.resolve(specifier)).href);
  const [{ Context }, { SystemPrompt }, { ToolRuntime }, { SkillRegistry }, mcpClient] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-system-prompt'),
    load('@deepseek-ai/dsh-tools'), load('@deepseek-ai/dsh-skill'), load('@deepseek-ai/dsh-mcp-client'),
  ]);
  const nativeVersion = JSON.parse(await readFile(requireFromHost.resolve('@deepseek-ai/dsh-mcp-client/package.json'), 'utf8')).version;
  assert.equal(nativeVersion, '0.2.1-rc.3');
  const expected = TOOL_NAMES.map(name => `mcp__windows__${name}`);
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  async function until(predicate) {
    const deadline = performance.now() + 10000;
    while (performance.now() < deadline) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Native plugin did not reach the expected state');
  }
  function context() {
    const ctx = new Context();
    new SystemPrompt(ctx, {});
    new ToolRuntime(ctx, {});
    new SkillRegistry(ctx, {});
    return ctx;
  }
  function mount(ctx, client, transport) {
    return ctx.plugin({ name: 'computer-use-verification', async apply(inner) {
      await mountPlugin(inner, { mcpClient: client, transport });
    } });
  }
  const execution = () => ({ signal: AbortSignal.timeout(60000) });

  const connect = deferred();
  let cleanup = 0, desktopCalls = 0;
  const fixture = {
    Config: mcpClient.Config, inject: mcpClient.inject,
    async apply(ctx) {
      ctx.effect(() => () => { cleanup++; connect.resolve(); });
      await connect.promise;
      // Disposal during setup must not register new contributions afterward.
      if (ctx.fiber.uid === null) return;
      for (const name of expected) ctx.tools.register({
        name, description: 'inert native integration fixture',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'fixture' }] },
        execute: async () => { desktopCalls++; return 'fixture'; },
      });
      ctx.systemPrompt.section({ name: 'mcp:test-instructions', order: 202, text: 'Fixture MCP instructions' });
    },
  };
  const ctx = context();
  const mounted = mount(ctx, fixture, createTransport(path.dirname(fileURLToPath(import.meta.url))));
  stage = 'fixture mount';
  await until(() => ctx.tools.get(READY_TOOL) !== undefined);
  try {
    const first = await ctx.systemPrompt.assemble();
    assert.deepEqual(first.tools.map(tool => tool.name), [READY_TOOL]);
    let ready = false;
    const pending = ctx.tools.get(READY_TOOL).execute({}, execution()).then(value => { ready = true; return value; });
    await tick();
    assert.equal(ready, false);
    assert.deepEqual((await ctx.systemPrompt.assemble()).tools.map(tool => tool.name), [READY_TOOL]);
    connect.resolve();
    stage = 'fixture readiness';
    assert.deepEqual((await pending).tools, expected);
    const next = await ctx.systemPrompt.assemble();
    assert.deepEqual(next.tools.map(tool => tool.name).sort(), [...expected, READY_TOOL].sort());
    assert(next.sections.some(section => section.text === 'Fixture MCP instructions'));
    stage = 'fixture skill snapshot';
    const skills = await ctx.skills.snapshot({ cwd: process.cwd(), signal: AbortSignal.timeout(5000) });
    assert(skills.skills.some(skill => skill.name === 'windows-computer-use'));
    assert.equal(desktopCalls, 0);
  } finally { stage = 'fixture disposal'; await mounted.dispose(); }
  assert.equal(cleanup, 1);
  assert.equal(ctx.tools.get(READY_TOOL), undefined);
  assert(expected.every(name => ctx.tools.get(name) === undefined));
  assert(!(await ctx.skills.snapshot({ cwd: process.cwd(), signal: AbortSignal.timeout(5000) })).skills.some(skill => skill.name === 'windows-computer-use'));

  const failureCtx = context();
  stage = 'failed initialization';
  const failed = mount(failureCtx, { ...fixture, async apply() { throw new Error('expected integration fixture failure'); } },
    createTransport(path.dirname(fileURLToPath(import.meta.url))));
  await until(() => failureCtx.tools.get(READY_TOOL) !== undefined);
  try {
    await assert.rejects(failureCtx.tools.get(READY_TOOL).execute({}, execution()), /unavailable/);
    assert.deepEqual((await failureCtx.systemPrompt.assemble()).tools.map(tool => tool.name), [READY_TOOL]);
  } finally { await failed.dispose(); }

  let liveConnection = false;
  if (options.has('--runtime')) {
    stage = 'live MCP';
    const liveCtx = context();
    const live = mount(liveCtx, mcpClient, createTransport(options.get('--runtime')));
    await until(() => liveCtx.tools.get(READY_TOOL) !== undefined);
    try {
      const readiness = await liveCtx.tools.get(READY_TOOL).execute({}, execution());
      assert.deepEqual(readiness.tools, expected);
      const result = await liveCtx.tools.get('mcp__windows__ControlStatus').execute({}, execution());
      assert(result.content.some(block => block.type === 'text'));
      assert.equal((await liveCtx.systemPrompt.assemble()).tools.length, 10);
      liveConnection = true;
    } finally { await live.dispose(); }
    assert.equal(liveCtx.tools.get(READY_TOOL), undefined);
    assert(expected.every(name => liveCtx.tools.get(name) === undefined));
  }
  console.log(JSON.stringify({
    nativeVersion, ordinaryRequestsDuringStartup: 'passed', firstDesktopReadiness: 'passed',
    nextStepToolsAndInstructions: 'passed', initializationFailureIsolation: 'passed',
    nativeDisposal: 'passed', liveConnection, desktopInputPerformed: false, screenshotsCreated: 0,
  }));
}
const watchdog = setTimeout(() => {
  console.error(`Native verification timed out: ${stage}`);
  process.exit(1);
}, 90000);
main().then(() => clearTimeout(watchdog), error => {
  clearTimeout(watchdog);
  console.error(`Native verification failed at ${stage}:`, error);
  process.exitCode = 1;
});
