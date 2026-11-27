# DSH shell theme

A ChatGPT-inspired styling layer for DSH's left sidebar. Uses native system
fonts, 14px navigation labels, 36px expanded navigation targets, 10px row
corners, theme-aware hover colors, keyboard focus and reduced-motion support.

Composer pass: 24px rounded surface (20px on narrow windows), aligned draft and
placeholder padding, native fonts, a 32px attachment control, neutral send
button, rounded attachment previews and visible remove controls. Preserves the
configured text size, editor handlers, auto-grow height cap, toolbar wrapping,
disabled/sending states and upload failure/progress indicators.

Chat/settings/menu pass: native response typography and 1.65 line height,
18px narrative block spacing (reasoning keeps 4px), rounded message actions,
24px desktop settings corners, softer settings navigation and 16px known shell
menus. Keeps configured chat text size, code/table rules, message width, scroll
and virtualization behavior, settings grid and menu keyboard/placement handlers.
Menu coverage: composer command picker, signed-out account menu, sidebar More,
model selection and popup command selections. Dialog coverage: feedback,
preset help, model onboarding and sign-in. Other shared primitive dialogs retain
their host styles until their specific surfaces are verified.

Preserves DSH labels, icons, navigation, scrolling, window controls and collapsed
rail geometry. No fonts, frameworks, network requests or ongoing observers.
No changes to app.asar. Disable this bundle to restore the original shell.

Selectors verified against installed `wtg9ga` SidebarRoot, `GRgSLq` InputBar,
`yTDIAG` ComposerAttachments and `EEnIVa` FileCard CSS modules on
2026-11-25. Future shell builds that rename that module need a compatibility
review; the old selectors otherwise stop matching safely.

Run `install-desktop.ps1`, then restart DSH. The installer backs up the profile
manifest and any replaced theme files. First installation may be staged while
DSH is running; replacing an installed copy requires closing DSH.

Visual appearance in the live application must be reviewed after activation.
Additional verified modules: `xMeOpW` AssistantMarkdown, `V4vHZW` ChatView,
`_1KfHza` MessageIconActions, `AnXs9G` SettingsRoot, `pc3rQa` MenuView and
`_5Qcc8a` AccountMenu. Check typography, long code, wide tables, settings
navigation and keyboard menu selection after restarting DSH.

Version 0.4 adds verified `_9r0rkG` ModelSelect, `j99sVW` PopupSelectView,
`cS6V_W` FeedbackDialog, `Fi3Lcq` PresetGuideDialog, `TLFO4W` OnboardingModal
and `J8V0KW` SignInDialog. No picker anchor or modal positioning overrides.
Search keeps its clear-button inset and 16px touch-device input text. The
theme preserves disabled, active, error and loading colors from the host.

Version 0.4.1 removes persistent search and composer strokes. Normal search,
feedback and settings fields use subtle theme-aware fills; focus remains
visible for keyboard use. Validation borders, selected feedback categories,
disabled controls, checkboxes and radios retain their host semantics.

For CSS-only revisions with identical module configuration, `update-style.ps1`
backs up and atomically replaces `client.js` in both installed copies without
changing profile registration or manifests. DSH may remain open; reload/restart
if its client does not hot-reload. Dependency/configuration changes still use
the full installer with DSH closed. Installed manifest version is unchanged
until the next full installation.

Version 0.4.2 extends the soft styling to verified shared Menu (`70kcw`) and
Modal (`1ytzq`) primitives from the installed frontend, including permission
and context menus, nested menus and confirmation dialogs. Keeps compact/dense
menu geometry, positioning, warnings, danger colors, acknowledgements and
disabled actions. Permission controls use verified `_86kJGG` and `_1jfq5W`
selectors. Shared button outline variant (`1ulci`) uses a filled surface inside
dialogs, while selected/destructive button variants remain unchanged.

Version 0.5 adds a 56px icon rail on expanded Windows desktop sidebars at
viewport widths of at least 900px, when CSS anchors are supported. Original
panel buttons occupy the rail; header, New chat, workspaces and account remain
in the adjacent pane. Original More and pin/unpin controls remain functional.
Accessible names remain on buttons and native hover titles identify icons.
The rail has its own scroll area for long tool lists. Drawer, narrow-window
and collapsed layouts retain the host behavior. No buttons or React nodes are
cloned or reparented; plugin disposal removes both styling and added titles.

The two-column concept is incremental: account-in-rail, independent chat-pane
collapse, and pinned/workspaces/recents reorganization are future passes.

Version 0.5.1 unifies the rail and chat pane with the same sidebar fill (no
gradient or divider). Locally embedded outline artwork replaces sidebar tool
icons and New chat artwork. Calendar, artifacts, plugins, More, Dreamer,
Power BI, Whiteboard and Desktop receive coordinated shapes; unrecognized
tool labels use the same grid fallback. Semantic label mappings currently
target the English tool names. Buttons and accessible names stay original.
Icons inherit theme color and use only a 1px hover lift and brief press-scale
feedback when reduced motion is not requested. No continuous animation,
external font, dependency or network asset is added.

Version 0.6 restores a subtle 1px rail divider and keeps the rail visible when
the Windows desktop chat sidebar is collapsed (>=900px, non-drawer). The main
column reserves 56px inside its existing track; native rightbar tracks and
resizers are not rewritten. The account launcher moves to the rail bottom and
a gear above it invokes the existing `settings.open` shortcut command. Actual
desktop update notices retain their own indicator, tooltip and action when
available; no fictional activity/usage indicator is displayed. The command
invocation adapter is verified against this installed shortcuts registry.

Unknown tool labels now keep their native icon instead of receiving a duplicate
grid. Known tools retain the coordinated replacements. Auth/profile data and
the account menu remain managed by DSH. Native update/connection visibility
continues to follow the host's wide/collapsed behavior.

Version 0.6.1 refines the existing workspace pane: quieter section heading,
36px workspace/chat rows, consistent native typography and rounded search,
filter and clear controls. Expanded workspace search is a filled surface with
no permanent border. Native pinning, grouping preferences, archive filters,
rename, drag/drop and search result handlers remain unchanged. Separate Pinned
and Recents sections have not yet been implemented; this version does not
replace or relabel the live workspace browser.

Version 0.7 removes the added Settings cog. The quota companion owns the live
usage control in that rail position; account-menu Settings remains available.
Cron jobs use the supplied Calendar Clock artwork with a short clock-hand
animation on hover and static artwork under reduced motion. Attribution and
license are in THIRD-PARTY-NOTICES.md. This adapts the artwork to CSS masks
without adding Motion or a runtime icon dependency.

Version 0.8 adds a real Pinned section below New chat via the native
`sidebar.session.action` wrapper slot. It subscribes to workspace pins and
session metadata, preserving pin order and excluding archived chats, subagents,
blank drafts and duplicate IDs. Selecting a row uses `uiWorkspace.openSession`;
unpinning uses `uiWorkspace.unpinSession` with live permission checks and an
error state on failure. The section remembers its collapsed state locally and
has a bounded scroll area. The existing workspace browser remains mounted and
keeps its own pin/menu actions; no separate copy of pin state is persisted.
Recents is not implemented in this pass.

Version 0.8.1 restores the complete supplied Motion components for Calendar
Clock (Automation tasks) and Folder Plus (Add workspace), including every path,
keyframe, delay, easing, overshoot and reset behavior. React/Motion components
are mounted over the original artwork; the original buttons keep their actions.
Motion is bundled locally, React stays external and provided by DSH. System
reduced motion uses the supplied static normal state. No stages are omitted.

client.js is now generated: edit src/theme-client.js or src/animated-icons.tsx,
then run npm run build. Install devDependencies first, or set DSH_UI_TOOLCHAIN
to a package.json for an existing Motion/esbuild toolchain. No runtime npm
installation is needed. The icon adapter cleans up mounts and event listeners
when the plugin is removed or shell buttons are remounted.

Version 0.9 uses the official @animateicons/react 0.13.0 Lucide components for
Artifacts (Files), Plugins (Puzzle), More (Ellipsis), Dreamer (MoonStar), Desktop
(Monitor), Power BI (ChartNoAxesCombined), Whiteboard (Presentation), New chat
(SquarePen), workspace search (Search), view options (SlidersHorizontal), composer
add (Plus) and send (ArrowUp). The supplied CalendarClock and FolderPlus source
components remain unchanged. All selected animations are bundled with their
original behavior; no runtime network requests or browser installation are needed.
Unknown controls retain their original icons. Native Stop and sending states
are excluded from the send-arrow replacement. The quota ring remains data-driven.

Version 0.9.1 adds the ready-made Copy, ThumbsUp, ThumbsDown and GitBranch
animations to native chat-message actions. The fourth action branches a chat;
it is not Share. Copied checkmarks, selected/filled feedback, unavailable branch
states, action handlers and native icon sizing remain managed by DSH. Animation
mounts follow the state changes without replacing the underlying buttons.

See QA.md for the isolated light/dark and narrow-window review, its reproducible
preview builder and the live-host behaviors still awaiting verification.

Translucency pass: theme-aware translucent sidebar fill, frosted composer and shell menus with 20px backdrop blur, subtle edge highlights and shadows. Reduced-transparency, forced-colors and unsupported browsers retain the existing solid surfaces. Sidebar filtering is deliberately avoided to preserve fixed rail positioning. This is in-app translucency, not native desktop wallpaper transparency. Build and CSS parsing verified; live appearance requires reload/restart and review.


Final glass pass: removed custom 56px rail layout and extra tooltips, restoring native component buttons and footer. Composer and docked right pane use 32% theme-aware fills; floating/fullscreen panes use denser frost. Native window-control background correction is packaged separately in D:/DSH/glass-finish-work. Build, JavaScript syntax and CSS parsing checked.


Removed the active composer-seat opaque gradient, desktop sidebar tint/shadow and sidebar bottom fade in glass mode. Solid accessibility fallback and drawer backgrounds remain. Transparent native caption controls installed and archive hash verified; both theme copies updated through the backup installer. Build, JavaScript syntax and CSS parsing passed. Final live appearance has not been reviewed.
