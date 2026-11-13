# ObsidianUI Analytics Dashboard

Source: https://www.obsidianui.dev/r/registry.json
Documentation: https://www.obsidianui.dev/docs/analytics-dashboard
Retrieved 2026-11-12. Registry SHA-256: 077f64478c865de5bbf4dd4865190281d6bde7c026484e85b953efcef1800393

Adaptations: relative imports, explicitly injected/scoped CSS, prefixed number CSS classes, empty-avatar handling and reduced-motion scrolling. OpenUI wrapper, schemas and session bridges are local additions. Demo data is not used by the wrapper.

Removed demo-only file attachment controls and simulated profile/notification saves. Appearance settings remain local to the view. Assistant errors are displayed, and question length is bounded.

React 18 compatibility: explicit Context.Provider and string inert attributes. Local repository bookmarks do not change star counts. Account settings navigation leads to view-local appearance only. Date captions and PR counts come from supplied data. StatusBars is a local accessible adaptation of the catalog's status-history concept, without its Tailwind/number-flow dependency or invented uptime calculations.
