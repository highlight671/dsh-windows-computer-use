import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runtimeRoot, assertNoLinks, sha256, WINDOWS_MCP_VERSION, PYTHON_VERSION, UV_VERSION } from '../src/runtime.mjs';

const { values } = parseArgs({ options: {
  apply: { type: 'boolean', default: false },
  root: { type: 'string' }, uv: { type: 'string', default: 'uv' },
} });
const root = runtimeRoot({ runtimeRoot: values.root });
const plan = {
  apply: values.apply, runtimeRoot: root, pythonVersion: PYTHON_VERSION,
  windowsMcpVersion: WINDOWS_MCP_VERSION, uvVersion: UV_VERSION,
  operations: [
    'Create a NEW private runtime directory; refuse existing targets or links.',
    'Use the supplied uv to download a managed Python and binary-only pinned packages.',
    'Write server.toml and an installation receipt inside that runtime only.',
  ],
  profileChanges: false, globalAgentsChanges: false,
  automaticDesktopInput: false, registryOrSecurityChanges: false,
};
console.log(JSON.stringify(plan, null, 2));
if (!values.apply) process.exit(0);
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 is required.');
await assertNoLinks(root);
try {
  await fs.lstat(root);
  throw new Error('Runtime directory already exists. Nothing changed. Choose a NEW --root.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 300000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}):\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
const uv = values.uv;
const version = run(uv, ['--version'], process.env);
if (!version.startsWith(`uv ${UV_VERSION} `) && version !== `uv ${UV_VERSION}`) {
  throw new Error(`Expected uv ${UV_VERSION}; got ${version}. Nothing changed.`);
}
// Read all release inputs before making the target directory.
const server = await fs.readFile(new URL('../config/server.toml', import.meta.url));
const requirements = fileURLToPath(new URL('../requirements-windows.txt', import.meta.url));
await fs.access(requirements);
await fs.mkdir(path.dirname(root), { recursive: true });
await assertNoLinks(path.dirname(root));
await fs.mkdir(root); // exclusive creation: do not adopt an existing installation
await assertNoLinks(root);
const env = {
  ...process.env,
  UV_PYTHON_INSTALL_DIR: path.join(root, 'python'), UV_CACHE_DIR: path.join(root, 'uv-cache'),
  UV_PYTHON_BIN_DIR: path.join(root, 'bin'), UV_NO_CONFIG: '1',
  UV_PYTHON_PREFERENCE: 'only-managed', UV_PYTHON_DOWNLOADS: 'automatic', UV_NO_PROGRESS: '1',
};
const python = path.join(root, '.venv', 'Scripts', 'python.exe');
try {
  console.log('Installing managed Python without registry or global executable registration...');
  console.log(run(uv, ['python', 'install', '--no-bin', '--no-registry', PYTHON_VERSION], env));
  console.log('Creating the private environment...');
  console.log(run(uv, ['venv', '--python', PYTHON_VERSION, path.join(root, '.venv')], env));
  console.log('Installing pinned binary dependencies...');
  console.log(run(uv, ['pip', 'install', '--python', python, '--only-binary', ':all:',
    '--index-url', 'https://pypi.org/simple', '-r', requirements], env));
  console.log(run(uv, ['pip', 'check', '--python', python], env));
  const actual = run(python, ['-c', 'import importlib.metadata; print(importlib.metadata.version("windows-mcp"))'], env);
  if (actual !== WINDOWS_MCP_VERSION) throw new Error(`Unexpected Windows-MCP version: ${actual}`);
  await fs.writeFile(path.join(root, 'server.toml'), server, { flag: 'wx' });
  await fs.writeFile(path.join(root, 'installation.json'), JSON.stringify({
    format: 1, createdAt: new Date().toISOString(), windowsMcpVersion: actual,
    pythonVersion: PYTHON_VERSION, uvVersion: UV_VERSION, serverConfigSha256: sha256(server),
  }, null, 2) + '\n', { flag: 'wx' });
  console.log('Runtime installed. No Harness profile was changed. Run the read-only probe before enabling the plugin.');
} catch (error) {
  console.error(`Installation incomplete. Retained for diagnosis: ${root}. No automatic recursive cleanup performed.`);
  throw error;
}
