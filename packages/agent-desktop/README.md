# agent-desktop MCP integration

The dependency manifest/lockfile pins the official agent-desktop 1.3.0 package.
Native binaries and installed dependencies are ignored, not stored in Git.

1. Run `npm ci` to install the official package and its verified native executable.
2. Run `node install-profile.mjs` to prepare ignored `dsh-entry.yml` with local paths.
3. Validate the proposed entry using `validate-config.mjs` in DSH Electron Node mode.
4. Run `node install-profile.mjs --apply` only when you intend to modify the private
   Desktop profile. It checks for duplicates and keeps a backup beside that profile.
5. Restart DSH. The tools use namespace `mcp__agent_desktop__`.

The example YAML contains placeholders only. `DSH_PROFILE_DIR` and
`DSH_RUNTIME_ROOT` can override machine-specific defaults; keep their values local.

`node verify-mcp.mjs` checks initialize, tool discovery and a version-only call.
`verify-dsh.mjs` checks the actual packaged DSH MCP client and native executor; run
it with the installed Electron executable and `ELECTRON_RUN_AS_NODE=1`.
`validate-config.mjs --installed` checks the installed profile instead of a proposal.

Verification uses metadata/version operations, not snapshots, screenshots, app
enumeration, clipboard reads or desktop actions. The MCP entry enables neither
physical input (`--headed`) nor tracing. Upstream agent instructions tell the model
to load its desktop/platform guides before operating apps. DSH's normal tool
permissions remain in effect.

Source: https://github.com/vercel-labs/agent-desktop (Apache-2.0).
