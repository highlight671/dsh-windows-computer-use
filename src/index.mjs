import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadRuntime } from './runtime.mjs';

export const name = 'windows-computer-use';
export const inject = ['tools', 'skills', 'systemPrompt'];
const skillUrl = new URL('../skills/windows-computer-use/SKILL.md', import.meta.url);
const safetyUrl = new URL('../skills/windows-computer-use/references/safety.md', import.meta.url);
const resourceBase = {
  kind: 'directory',
  path: fileURLToPath(new URL('../skills/windows-computer-use/', import.meta.url)),
};

// Kept separate from dependency loading so the registration and disposal
// contract can be exercised without connecting to a live desktop.
export async function mountPlugin(ctx, { mcpClient, transport, rank = 600 }) {
  const raw = await readFile(skillUrl, 'utf8');
  const content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  const safety = await readFile(safetyUrl, 'utf8');
  const candidate = {
    name: 'windows-computer-use',
    description: '通过 Windows-MCP 操作指定 Windows 应用，重新观察并核验结果，按需截图与安全收尾；用于桌面任务或明确请求的能力验收。',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'windows-computer-use', source: 'bundled', resourceBase,
    rank, locator: skillUrl,
  };
  ctx.systemPrompt.section({
    name: 'windows-computer-use:safety', order: 200,
    interpolate: false,
    text: `Windows desktop tools use the mcp__windows__ namespace. Before desktop input, load the windows-computer-use skill.\n\n${safety}`,
  });
  ctx.skills.registerProvider(() => ({
    name: candidate.provider,
    list: async () => [candidate],
    get: async () => ({ ...candidate, content }),
  }));
  // Cordis owns the child plugin and effect disposers. Disabling the parent
  // removes its prompt/skill contributions and closes the MCP connection.
  return ctx.plugin(mcpClient, transport);
}

export async function apply(ctx, config = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('This release supports Windows x64 only.');
  }
  const transport = await loadRuntime(config);
  const [mcpClient, { BUNDLED_SKILL_RANK }] = await Promise.all([
    import('@deepseek-ai/dsh-mcp-client'), import('@deepseek-ai/dsh-skill'),
  ]);
  await mountPlugin(ctx, { mcpClient, transport, rank: BUNDLED_SKILL_RANK });
}
