"""Read-only MCP tool discovery and control-status probe. No screenshot/input."""
import argparse
import asyncio
import json
import os
from pathlib import Path
from fastmcp import Client

TOOLS = ['App', 'Snapshot', 'Screenshot', 'Click', 'Type', 'Scroll', 'Wait', 'WaitFor', 'ControlStatus']


async def main(root: Path):
    if not root.is_absolute():
        raise ValueError('--runtime must be an absolute path')
    config = {
        'command': str(root / '.venv' / 'Scripts' / 'python.exe'),
        'args': ['-m', 'windows_mcp', 'serve', '--transport', 'stdio', '--config',
                 str(root / 'server.toml'), '--tools', ','.join(TOOLS)],
        'cwd': str(root),
        'env': {'ANONYMIZED_TELEMETRY': 'false', 'DO_NOT_TRACK': '1',
                'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8',
                'WINDOWS_MCP_SCREENSHOT_BACKEND': 'pillow',
                'WINDOWS_MCP_EXCLUDE_PROCESSES': 'Codex.exe,Weixin.exe,1Password.exe,KeePass.exe,Bitwarden.exe,CredentialUIBroker.exe,LockApp.exe,SecHealthUI.exe'},
    }
    async with Client({'mcpServers': {'windows': config}}, timeout=60, init_timeout=60) as client:
        names = sorted(tool.name for tool in await client.list_tools())
        if names != sorted(TOOLS):
            raise RuntimeError(f'Unexpected exposed tool set: {names}')
        result = await client.call_tool('ControlStatus', {})
        if result.is_error:
            raise RuntimeError('ControlStatus returned an MCP error')
        print(json.dumps({'tools': names, 'controlStatus': '\n'.join(
            getattr(item, 'text', '') for item in result.content),
            'desktopInputPerformed': False, 'screenshotsCreated': 0}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('DSH_HOME', str(Path.home() / '.dsh'))) / 'tools' / 'dsh-windows-computer-use')
    asyncio.run(main(parser.parse_args().runtime))
