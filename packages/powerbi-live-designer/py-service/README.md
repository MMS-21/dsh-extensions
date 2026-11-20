> Historical starter documentation. The current 0.4.2 package README one directory above takes precedence.

# Power BI Live Designer Starter v0.2

Local preview and guarded smart affected-table refresh planning for Power BI Desktop and DeepSeek Harness.

Read `IMPLEMENTATION_GUIDE.md` in this archive before use. This prototype is not an unattended production refresh engine. Model processing is disabled until an operator configures and tests the installed Power BI MCP operation profile, and full visual AI review is a future integration.

Quick start on Windows with a local `.pbip` open in Power BI Desktop:

```powershell
npm install -g @microsoft/powerbi-report-authoring-cli
cd C:\Tools\powerbi_live_designer_starter
py -3 -m unittest discover -s tests -v
py -3 server.py --project 'C:\BI\Sales\Sales.pbip' --port 8765
```

Open `http://127.0.0.1:8765` in the DeepSeek Harness Desktop Browser sidebar.

To enable optional processing, read `IMPLEMENTATION_GUIDE.md`, install `mcp` and `jsonschema`, inspect actual MCP tool schemas with `inspect_mcp.py`, and create a validated private `mcp_profile.json`. Do not add `--mcp-profile` until real Desktop support is tested.
