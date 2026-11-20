"""Operator-mapped Power BI MCP calls, with no invented Microsoft tool arguments.

Needs: py -m pip install 'mcp>=1.0' jsonschema
The operator must fill mcp_profile.json from tools/list of the installed
Microsoft Power BI MCP version. The profile is deliberately NOT shipped filled.
This module NEVER accepts tool names/commands from the browser or an LLM turn.
"""
from __future__ import annotations
import asyncio
import copy
import json
from pathlib import Path
from typing import Any


def _render(value: Any, *, table: str = '', query: str = '') -> Any:
    if isinstance(value, str):
        return value.replace('{{TABLE}}', table).replace('{{QUERY}}', query)
    if isinstance(value, list):
        return [_render(v, table=table, query=query) for v in value]
    if isinstance(value, dict):
        return {k: _render(v, table=table, query=query) for k, v in value.items()}
    return value


class MCPAdapter:
    def __init__(self, profile_path: Path):
        self.profile_path = profile_path.resolve()
        self.profile = json.loads(self.profile_path.read_text(encoding='utf-8'))
        if not self.profile.get('desktopProcessingValidated'):
            raise RuntimeError('MCP profile has not been validated against this Desktop build; processing blocked')
        for field in ('command', 'args', 'connection', 'calculate', 'full', 'dax'):
            if field not in self.profile:
                raise RuntimeError(f'Profile missing {field}; discover installed tool schema first')
        if not isinstance(self.profile['command'], str) or not isinstance(self.profile['args'], list):
            raise RuntimeError('Invalid MCP process configuration')

    async def _execute(self, operations: list[dict]) -> list[dict]:
        from mcp import Client, StdioServerParameters
        from jsonschema import Draft202012Validator
        spec = StdioServerParameters(command=self.profile['command'], args=self.profile['args'])
        results = []
        async with Client(spec) as client:
            listed = await client.list_tools()
            tools = {t.name: t for t in listed.tools}
            calls = [self.profile['connection'], *operations]
            for step in calls:
                name, args = step.get('tool'), step.get('arguments', {})
                if not name or name not in tools:
                    raise RuntimeError(f'MCP tool {name!r} not exposed by installed server')
                if not isinstance(args, dict):
                    raise RuntimeError('MCP mapped arguments must be an object')
                schema = tools[name].input_schema
                errors = list(Draft202012Validator(schema).iter_errors(args))
                if errors:
                    raise RuntimeError(f'MCP schema mismatch for {name}: {errors[0].message}')
                response = await client.call_tool(name, args)
                if response.is_error:
                    raise RuntimeError(f'MCP tool {name} returned an error; inspect MCP host logs')
                results.append({'tool': name, 'ok': True, 'structured': response.structured_content})
        return results

    def execute(self, processing: list[dict], dax_queries: list[str]) -> list[dict]:
        operations = []
        for step in processing:
            key = 'calculate' if step['type'] == 'Calculate' else 'full'
            operations.append(_render(copy.deepcopy(self.profile[key]), table=step.get('table', '')))
        for query in dax_queries:
            operations.append(_render(copy.deepcopy(self.profile['dax']), query=query))
        return asyncio.run(self._execute(operations))


async def inspect_tools(command: str, args: list[str]) -> dict:
    """Read actual tool names and argument schema, no processing operations."""
    from mcp import Client, StdioServerParameters
    async with Client(StdioServerParameters(command=command, args=args)) as client:
        listed = await client.list_tools()
        return {tool.name: tool.input_schema for tool in listed.tools}
