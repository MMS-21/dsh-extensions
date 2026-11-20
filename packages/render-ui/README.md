# OpenUI integration

Source for the DSH `render_ui` bundle, including standard OpenUI, saved artifacts,
the ObsidianUI-derived AnalyticsDashboard and the local StatusBars adaptation.

Install with `pnpm install --frozen-lockfile --ignore-scripts`, build with
`npm run build`, and run `npm test`. The build regenerates schemas, model-facing
instructions, validators, the browser bundle and third-party notices. These build
outputs are ignored by Git. The source includes no private provider configuration.

`AnalyticsDashboard` and `StatusBars` are standard-library components; call
`ui_library` with `library: standard`. A dashboard needs complete supplied data or
real Query-backed data. Examples must set `mock=true`. Optional `answerTool` names
an existing session tool; otherwise questions draft into the source chat for
review and Send. Neither component creates a data-provider or model backend.

The original `library: dashboard` dialect still renders saved dashboards. Use
`library: dashboard-v2` with `ui_library` and `render_ui` for Dashboard Library
1.0.1 and its Dashboard/Section/Row/Card grammar. Existing artifact,
snapshot, form-state, streaming isolation and native tool-execution behavior is
covered by tests. View-local appearance/bookmarks are not backend account changes.

`npm run build:preview` creates the isolated preview. `verify-analytics-browser.mjs`
uses Playwright and accepts `CHROMIUM_PATH`; `host-rc3-smoke.mjs` runs through
packaged Electron's Node mode and accepts `DSH_RUNTIME_ROOT`.

With DSH closed, `install-desktop.ps1` backs up and updates both installed runtime
copies. Current compatibility declarations target DSH 0.2.2-rc.3. If installing
into an older manifest, synchronize its peer declarations from package.json only
after verifying the actual target runtime.

Upstream attribution and adaptation notes are in `src/vendor/obsidian/SOURCE.md`.

