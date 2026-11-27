# Theme consistency review

Reviewed 2026-11-25 using an isolated browser fixture assembled from the installed
frontend CSS, ModelSelect CSS-module map, current theme source and representative
neutral theme tokens. This is a styling check, not a test of the running DSH app.

## Observed

- Light and dark previews at 1280×720 and 390×844 fit without page-level
  horizontal overflow.
- Model search has a transparent border at rest and a visible focus indicator
  after keyboard navigation.
- Shared permission menus retain selected, destructive and disabled treatments.
- Compact menu rows retain their compact geometry.
- Confirmation card fits its column and narrow window; disabled confirm remains
  visibly disabled. No shell permissions were changed.
- Preview uses the host TextInput classes, including its borderless inner input.

## Limits

The fixture places menu cards in document flow to inspect their appearance.
It does not validate live CSS anchors, portal collision handling, nested menu
navigation, modal focus traps, real theme values, model selection, confirmation
actions, or reduced-motion OS settings. Those host behaviors remain unchanged
by this theme but require live application verification before claiming coverage.

Build the preview with:

```powershell
node packages/shell-theme/build-style-preview.mjs D:/DSH/shell-style-evidence D:/DSH/render-inline-check/index.html
```

The extracted evidence files are local QA inputs and are not packaged with the
extension. Refresh their CSS/module maps when the installed DSH version changes.

## Icon rail pass

`build-rail-preview.mjs` renders the installed SidebarRoot in isolation with
representative workspace, account and service boundaries. The original tool,
New session, unpin and collapse handlers execute. Icons and shared Menu are
fixture stand-ins, so this is not coverage of the live application's portal
or model/session services.

Observed at 1280×720: 40px navigation inside the 56px rail, no workspace overlap;
tool selection and New session callbacks fired; More opened; unpin removed a
tool and repin restored it. Drawer mode and 800px viewport restored original
navigation layout. Collapse retained the original Windows caption controls.
Actual installed-shell visual confirmation remains pending after activation.

## Unified skin and icons

The installed SidebarRoot fixture at 1280×720 showed a continuous sidebar
background, matching outline navigation icons, a three-dot More icon and the
new compose icon. Tool selection still invoked the original callback. SVG
masks rendered successfully in Chromium. Reduced-motion handling was checked
in source: motion rules are inside `prefers-reduced-motion: no-preference`;
an OS-level reduced-motion visual check remains pending.

## Rail quota and supplied calendar icon

The quota client was mounted in the installed SidebarRoot fixture using a
synthetic RPC response (37% primary, 12% weekly), then switched to unavailable.
Observed both windows, reset times, refresh action, explicit unknown state,
and opening the quota popover with the chat pane collapsed. The Calendar Clock
artwork rendered. These are UI checks, not evidence of actual account usage.
All 15 quota-companion package tests passed. Live provider data still requires
verification in the running DSH application.

## Pinned section

The actual Pinned wrapper was mounted with the installed SidebarRoot and
synthetic workspace/session stores. Observed two distinct pinned chats while
archived, subagent, draft, missing metadata and duplicate fixture entries were
excluded. Opening invoked the navigation callback; unpin removed the row, and
an external pin-store update restored it. A rejected unpin retained the row and
showed an alert. Revoking permission removed the unpin action. Section collapse
persisted across chat-pane collapse/expand and page reload. The rail remained
visible when the chat pane collapsed. No real chat pins were modified during
these checks. Live host slot registration and real account navigation remain
pending verification after activation.

## Persistent rail and bottom controls

The isolated SidebarRoot fixture now includes the zero-width collapsed grid
track used by Windows AppFrame. At 1280×720, collapsing hid workspaces while
leaving tool buttons and bottom Settings/account controls visible; tool selection
still fired, and expanding restored workspaces. The thin divider remained.
Settings invoked the fixture shortcuts adapter; Account invoked its slot stub.
At 800px the original sidebar layout returned. Real account data, real settings
modal opening and conditional update notifications still need live verification.
