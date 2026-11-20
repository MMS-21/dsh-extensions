"""Usage: python inspect_mcp.py -- npx -y @microsoft/powerbi-modeling-mcp@latest --start
Review and accept Microsoft's EULA before any `--accepteula` use.
"""
import asyncio
import json
import sys
from mcp_adapter import inspect_tools

if __name__ == '__main__':
    if '--' not in sys.argv:
        raise SystemExit('Usage: python inspect_mcp.py -- <executable> [args ...]')
    argv = sys.argv[sys.argv.index('--') + 1:]
    if not argv:
        raise SystemExit('Missing MCP executable')
    print(json.dumps(asyncio.run(inspect_tools(argv[0], argv[1:])), indent=2))
