# Session delete

A Web client plugin for the DeepSeek Harness chat shell that adds a **Delete
session…** action to the session row menu. It permanently removes a stored
session — its artifact directory, its Workspace-registry membership, and its
archive/pin marks — which stock Harness deliberately does not do (sessions can be
archived but never deleted).

## What it shows

A `Delete session…` item in each session row's `…` menu (and right-click menu),
after Archive. Activating it opens a confirmation dialog; confirming deletes the
session and refreshes the sidebar list.

## How it works

- **Host** (`index.js`): registers one authenticated fetch route on the shared
  Connection channel, `POST /api/sessionDelete`. It locates the session through
  `sessionPersistence.list()` (which exposes each artifact's `location.path`),
  removes that directory, detaches the id from every Workspace record, and clears
  the registry archive/pin marks.
- **Client** (`client.js`): registers the menu item through `ctx.contextMenus`
  (order 700) and the confirmation dialog through the `shell.overlay` slot.
  Confirming calls the route through `ctx.connection.rpc.call('/api',
  'sessionDelete', …)`, then calls `ctx.sessions.refresh()` so the sidebar row
  disappears immediately.

## Safety

The route refuses, with a specific message:

- unknown sessions (`session/not-found`);
- sessions with a running turn (`session/running`);
- sessions that still have child (subagent) sessions (`session/has-children`).

A session that is live but idle — one a resident view still holds even though no
conversation is visibly open — is detached through the session/agent registries
first, so its stored log is not removed from under an open writer. Deletion is
irreversible. The projection-cache row for a removed session is left in place on
purpose: it is a disposable derived store keyed by a lifecycle identity, and a
stale row is rejected at read time.

## Files

- `index.js` — Host route and deletion logic.
- `client.js` — menu item, confirmation dialog, styles, locale dictionaries.
- `cordis.patch.yml` — inserts the `session-delete` row.
- `locale/*.json` — Plugin Manager display metadata.
- `icon.svg` — the plugin icon.

## Verification

Three Node checks load the real artifacts:

- `verify-session-delete.mjs` — deletion logic against a real temporary session
  tree (unknown/running/children refusals, the live-idle detach, and the
  end-to-end delete).
- `verify-session-delete-host-apply.mjs` — route registration and the Connection
  RPC envelope (request validation and error codes).
- `verify-session-delete-client.mjs` — menu/overlay registration, dialog render,
  the RPC payload, and the post-delete list refresh.

## Installation and removal

Installed as a profile bundle with `plugin_manager` → `install_bundle`. The
Desktop profile links this directory, so edits are picked up by the plugin HMR
poll. Removing the bundle from the profile removes the menu action.
