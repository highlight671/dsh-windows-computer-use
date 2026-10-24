import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { mountPlugin, apply } from '../src/index.mjs';
import { createTransport } from '../src/runtime.mjs';
import path from 'node:path';

test('bundle registers a usable Skill, literal guardrails and a child MCP plugin', async () => {
  const calls = { sections: [], providers: [], children: [] };
  const ctx = {
    systemPrompt: { section: value => calls.sections.push(value) },
    skills: { registerProvider: factory => calls.providers.push(factory()) },
    plugin: (module, config) => calls.children.push({ module, config }),
  };
  const mcpClient = { async apply() {}, inject: ['tools'] };
  const transport = createTransport(path.resolve('test-runtime'));
  await mountPlugin(ctx, { mcpClient, transport });
  assert.equal(calls.children.length, 1);
  assert.equal(calls.children[0].module.name, 'windows-computer-use-mcp-background');
  assert.equal(calls.children[0].module.inject, mcpClient.inject);
  assert.deepEqual(calls.children[0].config, transport);
  assert.equal(calls.sections.length, 1);
  assert.equal(calls.sections[0].interpolate, false);
  assert.equal(calls.providers.length, 1);
  const [candidate] = await calls.providers[0].list();
  assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true });
  const loaded = await calls.providers[0].get(candidate);
  assert.equal(loaded.name, candidate.name);
  assert(loaded.content.length > 300);
  assert(!loaded.content.startsWith('---'));
  for (const match of loaded.content.matchAll(/\]\((references\/[^)]+)\)/g)) {
    await access(path.join(loaded.resourceBase.path, match[1]));
  }
});

test('missing runtime fails before adding tools, prompts or Skills', async () => {
  const ctx = new Proxy({}, { get: () => { throw new Error('Registration must not start'); } });
  await assert.rejects(apply(ctx, { runtimeRoot: path.resolve('missing-runtime-fixture') }),
    process.platform === 'win32' && process.arch === 'x64' ? /ENOENT/ : /Windows x64/);
});

test('bundle manifest resolves its actual entry and patch', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  await access(new URL('../' + manifest.main, import.meta.url));
  await access(new URL('../' + manifest.dsh.bundle.patch, import.meta.url));
  assert.equal(manifest.engines.dsh, '=0.2.1-rc.3');
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) assert(!(hook in manifest.scripts));
});
