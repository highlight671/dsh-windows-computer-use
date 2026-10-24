import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

export const WINDOWS_MCP_VERSION = '0.8.8';
export const PYTHON_VERSION = '3.14.9';
export const UV_VERSION = '0.13.5';
export const TOOL_NAMES = Object.freeze([
  'App', 'Snapshot', 'Screenshot', 'Click', 'Type', 'Scroll', 'Wait', 'WaitFor', 'ControlStatus',
]);

export function runtimeRoot(config = {}, env = process.env, userHome = os.homedir()) {
  const dshHome = env.DSH_HOME || path.join(userHome, '.dsh');
  const root = config.runtimeRoot || path.join(dshHome, 'tools', 'dsh-windows-computer-use');
  if (!path.isAbsolute(root)) throw new Error('runtimeRoot / DSH_HOME must be an absolute path.');
  return path.resolve(root);
}

// Check every existing component, rather than just the final file. On Windows,
// lstat().isSymbolicLink() also identifies directory junctions.
export async function assertNoLinks(target) {
  const absolute = path.resolve(target);
  const volume = path.parse(absolute).root;
  let cursor = volume;
  for (const segment of absolute.slice(volume.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      if ((await fs.lstat(cursor)).isSymbolicLink()) {
        throw new Error(`Refusing a symbolic link or junction: ${cursor}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createTransport(root) {
  return {
    serverName: 'windows',
    transport: 'stdio',
    command: path.join(root, '.venv', 'Scripts', 'python.exe'),
    args: ['-m', 'windows_mcp', 'serve', '--transport', 'stdio', '--config',
      path.join(root, 'server.toml'), '--tools', TOOL_NAMES.join(',')],
    cwd: root,
    env: {
      ANONYMIZED_TELEMETRY: 'false', DO_NOT_TRACK: '1',
      PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8',
      WINDOWS_MCP_SCREENSHOT_BACKEND: 'pillow',
      WINDOWS_MCP_EXCLUDE_PROCESSES:
        'Codex.exe,Weixin.exe,1Password.exe,KeePass.exe,Bitwarden.exe,CredentialUIBroker.exe,LockApp.exe,SecHealthUI.exe',
    },
    toolCallTimeoutMs: 60000,
    failOnStartupError: true,
  };
}

export async function loadRuntime(config = {}) {
  const root = runtimeRoot(config);
  await assertNoLinks(root);
  const receiptPath = path.join(root, 'installation.json');
  const pythonPath = path.join(root, '.venv', 'Scripts', 'python.exe');
  const configPath = path.join(root, 'server.toml');
  for (const file of [receiptPath, pythonPath, configPath]) {
    await assertNoLinks(file);
    if (!(await fs.stat(file)).isFile()) throw new Error(`Expected a file: ${file}`);
  }
  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  if (receipt.format !== 1 || receipt.windowsMcpVersion !== WINDOWS_MCP_VERSION) {
    throw new Error('Unsupported runtime. Run this release\'s setup script in a new runtime directory.');
  }
  if (sha256(await fs.readFile(configPath)) !== receipt.serverConfigSha256) {
    throw new Error('Runtime server.toml changed; inspect it before reinstalling.');
  }
  return createTransport(root);
}
