import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeRoot, assertNoLinks, createTransport, loadRuntime, sha256, TOOL_NAMES } from '../src/runtime.mjs';

async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-computer-use-test-'));
  t.after(async () => {
    // Only this test's exclusively created directory is eligible for removal.
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('dsh-computer-use-test-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

test('runtime paths are portable, explicit and absolute', () => {
  const home = path.resolve('example-home');
  assert.equal(runtimeRoot({}, {}, home), path.join(home, '.dsh', 'tools', 'dsh-windows-computer-use'));
  assert.equal(runtimeRoot({}, { DSH_HOME: home }), path.join(home, 'tools', 'dsh-windows-computer-use'));
  assert.throws(() => runtimeRoot({ runtimeRoot: 'relative' }), /absolute/);
  assert.throws(() => runtimeRoot({}, { DSH_HOME: 'relative' }), /absolute/);
});

test('transport exposes only the nine desktop tools and uses stdio', () => {
  const transport = createTransport(path.resolve('runtime with spaces & literals'));
  assert.equal(transport.transport, 'stdio');
  assert.deepEqual(transport.args.slice(-2), ['--tools', TOOL_NAMES.join(',')]);
  assert.equal(new Set(TOOL_NAMES).size, 9);
  for (const forbidden of ['PowerShell', 'FileSystem', 'Registry', 'Process', 'Clipboard', 'Shortcut']) {
    assert(!TOOL_NAMES.includes(forbidden));
  }
  assert.equal(transport.env.ANONYMIZED_TELEMETRY, 'false');
  assert.equal(transport.env.DO_NOT_TRACK, '1');
  assert.equal(transport.failOnStartupError, true);
  assert(!('url' in transport));
});

test('runtime receipt is checked and changed control config is rejected', async t => {
  const root = await temporary(t);
  await fs.mkdir(path.join(root, '.venv', 'Scripts'), { recursive: true });
  await fs.writeFile(path.join(root, '.venv', 'Scripts', 'python.exe'), 'fixture, never executed');
  const config = '[server]\ntransport = "stdio"\n';
  await fs.writeFile(path.join(root, 'server.toml'), config);
  await fs.writeFile(path.join(root, 'installation.json'), JSON.stringify({
    format: 1, windowsMcpVersion: '0.8.8', serverConfigSha256: sha256(config),
  }));
  assert.equal((await loadRuntime({ runtimeRoot: root })).serverName, 'windows');
  await fs.appendFile(path.join(root, 'server.toml'), '\n# unreviewed change');
  await assert.rejects(loadRuntime({ runtimeRoot: root }), /changed/);
});

test('links in any path component are rejected', async t => {
  const root = await temporary(t);
  const target = path.join(root, 'target');
  const link = path.join(root, 'linked');
  await fs.mkdir(target);
  try { await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Symlink privilege unavailable'); throw error; }
  await assert.rejects(assertNoLinks(path.join(link, 'new-file')), /symbolic link or junction/);
  await assertNoLinks(path.join(target, 'new-file'));
});

const setup = fileURLToPath(new URL('../scripts/setup-runtime.mjs', import.meta.url));
test('setup defaults to a non-mutating plan', async t => {
  const root = path.join(await temporary(t), 'not-created');
  const result = spawnSync(process.execPath, [setup, '--root', root], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.apply, false);
  assert.equal(plan.profileChanges, false);
  await assert.rejects(fs.stat(root), { code: 'ENOENT' });
});

test('setup refuses existing targets without altering their data', { skip: process.platform !== 'win32' }, async t => {
  const root = await temporary(t);
  const sentinel = path.join(root, 'user-file.txt');
  await fs.writeFile(sentinel, 'preserve this');
  const result = spawnSync(process.execPath, [setup, '--apply', '--root', root], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists/);
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve this');
  assert.deepEqual(await fs.readdir(root), ['user-file.txt']);
});

test('wrong uv version fails before creating a runtime', { skip: process.platform !== 'win32' }, async t => {
  const root = path.join(await temporary(t), 'not-created');
  const result = spawnSync(process.execPath, [setup, '--apply', '--uv', process.execPath, '--root', root], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected uv/);
  await assert.rejects(fs.stat(root), { code: 'ENOENT' });
});
