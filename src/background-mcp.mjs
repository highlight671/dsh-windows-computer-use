import { TOOL_NAMES } from './runtime.mjs';

// A local readiness tool, not an additional Windows-MCP desktop capability.
export const READY_TOOL = 'windows_computer_use_ready';

function waitForInitialization(initialization, signals) {
  const listeners = [];
  return Promise.race([initialization, new Promise((_, reject) => {
    for (const signal of signals.filter(Boolean)) {
      const abort = () => reject(signal.reason ?? new Error('Readiness check canceled'));
      signal.addEventListener('abort', abort, { once: true });
      listeners.push([signal, abort]);
      if (signal.aborted) abort();
    }
  })]).finally(() => {
    for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
  });
}

// Call inside a Cordis plugin's async apply without awaiting initialization.
// Native apply owns the connection, namespace, reconnect policy and disposal.
export function startBackgroundMcp(ctx, config, initialize, { onSettled = () => {} } = {}) {
  const lifetime = new AbortController();
  const stop = () => lifetime.abort(new Error('Windows computer-use plugin stopped'));
  ctx.effect(() => stop, 'windows-computer-use.readiness');
  ctx.on('internal/plugin', fiber => {
    if (fiber === ctx.fiber && fiber.uid === null) stop();
  }, { global: true });

  const expected = TOOL_NAMES.map(raw => `mcp__${config.serverName}__${raw}`);
  let failed = false;
  // Handle rejection immediately. Failure is reported by the readiness tool
  // and diagnostics; it never rejects an unrelated chat or prompt assembly.
  const settled = Promise.resolve().then(() => {
    lifetime.signal.throwIfAborted();
    return initialize(ctx, config);
  }).then(() => {}, () => {
    failed = true;
    if (!lifetime.signal.aborted) {
      ctx.logger.error('windows-computer-use: MCP initialization failed; inspect the native MCP diagnostic.');
    }
  }).then(() => {
    try { onSettled({ failed }); } catch { /* Optional diagnostics cannot affect availability. */ }
  });

  ctx.tools.register({
    name: READY_TOOL,
    description: '需要操作 Windows 桌面时先调用。等待后台 MCP 初始化并确认九个电脑工具可用；不截图、不点击、不输入。普通聊天和代码任务无需调用。成功后在下一步使用 mcp__windows__ 工具；就绪不代表已获得桌面控制权，仍需检查 ControlStatus。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: { ready: { type: 'boolean' }, tools: { type: 'array', items: { type: 'string' } } },
        required: ['ready', 'tools'], additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: `Windows desktop tools are ready: ${value.tools.join(', ')}. Check ControlStatus before desktop input.` }],
    },
    async execute(_args, execution) {
      execution.signal?.throwIfAborted();
      lifetime.signal.throwIfAborted();
      await waitForInitialization(settled, [execution.signal, lifetime.signal]);
      execution.signal?.throwIfAborted();
      lifetime.signal.throwIfAborted();
      const available = expected.filter(tool => ctx.tools.get(tool, execution.agent));
      // A successful later native reconnect may recover from initial failure.
      if (available.length !== expected.length) {
        throw new Error(`Windows desktop tools are unavailable${failed ? ' after initialization failed' : ' or disconnected'}. Inspect MCP diagnostics; no desktop input was performed.`);
      }
      return { ready: true, tools: available };
    },
  });
  ctx.systemPrompt.section({
    name: 'windows-computer-use:readiness', order: 201, interpolate: false,
    text: `Windows desktop tools initialize in the background. Normal chat and coding do not wait for them. Before a desktop task, call ${READY_TOOL}; it only waits for tool availability and performs no desktop input. If mcp__windows__ tools are absent from this step's snapshot, do not conclude that desktop control is unsupported: after readiness succeeds, the next model step receives the tools. Then check ControlStatus and follow the windows-computer-use skill. On readiness failure, report it; do not bypass controls.`,
  });
  return { settled };
}

export function backgroundMcpPlugin(mcpClient) {
  if (typeof mcpClient.apply !== 'function') throw new Error('Unsupported native MCP plugin: missing apply.');
  return {
    name: 'windows-computer-use-mcp-background',
    Config: mcpClient.Config,
    inject: mcpClient.inject,
    async apply(ctx, config) {
      startBackgroundMcp(ctx, config, mcpClient.apply);
    },
  };
}
