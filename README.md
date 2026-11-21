# DSH extensions

Compatibility monitoring and dependency updates are documented in [UPDATES.md](UPDATES.md).

Local version-controlled source for the DSH extensions developed in this workspace.

| Package | Contents |
| --- | --- |
| `packages/render-ui` | OpenUI rendering, artifacts, AnalyticsDashboard, StatusBars, source schemas, tests and Desktop installer |
| `packages/update-manager` | Desktop Extension Updates tab, installed compatibility checks and verified Render UI release staging |
| `packages/whiteboard` | Whiteboard canvas, workspace/session bridge, agent cursors, compact note prompts, Host tools and tests |
| `packages/agent-desktop` | Pinned native MCP dependency manifest, protocol/runtime verification and profile setup scripts |
| `packages/agent-state-light` | Composer agent-status indicator |
| `packages/session-delete` | Confirmed deletion of idle stored sessions |
| `packages/powerbi-live-designer` | Power BI 0.4.2 controlled authoring, model refresh, exact Desktop binding, native skills and fixture tests |
| `packages/request-budget` | Serialized request byte limits, durable 413 recovery, tests and Desktop installer |
| `packages/dreamer` | DSH-native idle reflection, dream journal, grounded insights, wake context, commands and parity audit |

This baseline was imported from the working source snapshots on 13 November 2026.
It is a new Git history, not a reconstruction of earlier edits. Deployment is a
separate step; installed DSH copies still have their existing locations.
Dreamer is a subsequent native port; its package documents verification and explicit differences from Hermes 1.5.0.

## Setup and verification

Requirements: Node.js, npm, pnpm and Git. DSH integration checks require DSH itself.
The Desktop installers and native-runtime defaults target Windows.

```powershell
cd packages/render-ui
pnpm install --frozen-lockfile --ignore-scripts
cd ../whiteboard
npm ci --ignore-scripts
cd ../dreamer
npm ci --ignore-scripts --legacy-peer-deps
cd ../..
npm test
```

`npm test` builds OpenUI and runs its unit/contract tests, then Whiteboard, Dreamer and Request Budget tests.
The imported baseline passed 62 OpenUI and 50 Whiteboard tests (112 total). Dreamer adds its own suite.
The Windows junction regression needs a process allowed to create a temporary
junction. Generated bundles, dependencies and verification artifacts are ignored.

Rendered tests use isolated browser fixtures. Install a local Chromium through
Playwright, or provide `CHROMIUM_PATH` for the OpenUI verifier and
`WHITEBOARD_CHROMIUM` for Whiteboard. In `packages/render-ui`, run
`npm run build:preview` then `node verify-analytics-browser.mjs`.
In `packages/whiteboard`, run `node tests/ui.browser.mjs`.

Native DSH smoke tests run using the installed Electron executable with
`ELECTRON_RUN_AS_NODE=1`; they do not open the GUI. `DSH_RUNTIME_ROOT` can override
the packaged `resources/app.asar/dsh` path. `DSH_PROFILE_DIR` overrides the default
`~/.dsh/profiles/desktop` profile. Keep local overrides in ignored environment files
or your shell, not committed source.

## Installation

- OpenUI: build first, close DSH, then run `packages/render-ui/install-desktop.ps1`.
  The installer backs up and hash-checks both installed copies. Source manifest
  compatibility targets DSH rc.3; check peer declarations when upgrading DSH.
- Whiteboard: see its README. Install the bundle through DSH and restart after
  Client/Host changes. Do not replace board/session data as part of deployment.
- agent-desktop: see its README. Generate a local MCP block, validate it, then
  explicitly apply it. The real profile file never belongs in this repository.
- Request Budget: run `npm test` in `packages/request-budget`, then run its `install-desktop.ps1` and restart DSH. No package dependencies are required.
- Dreamer: install its locked dependencies with `npm ci --ignore-scripts --legacy-peer-deps`,
  run tests, then close DSH and run its `install-desktop.ps1`. Read PARITY.md first.

## What belongs in Git

Track source, tests, dependency manifests/lockfiles, documentation and example
configuration. Lockfiles identify dependency versions; installed packages are not
committed. Modified vendored ObsidianUI component source is intentionally tracked
with its attribution because the adaptation depends on those source changes.

Do not track credentials, environment secrets, private DSH settings, chat history,
session memory, private databases, generated bundles, screenshots, logs, backups
or `node_modules`. A local pre-commit hook checks staged paths and high-confidence
secret patterns without printing matched values. This check reduces accidental
disclosure; it is not a substitute for reviewing `git diff --cached`.

## Working with Git

```powershell
git status
git diff
git add <specific-source-files>
git diff --cached
git commit -m "Describe the change"
```

The hook is enabled locally using `git config core.hooksPath .githooks`. New clones
should run that command too. Check `git remote -v` for your configured publication
destination before pushing.

