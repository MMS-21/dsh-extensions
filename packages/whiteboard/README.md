# DSH Whiteboard

Hermes Whiteboard port with Workspace → Whiteboard → Notes, direct native session
requests, prompt/change history, a borderless model selector, Suggestions, eraser,
compact exact-note references and session-driven animated agent cursors.

Install dependencies using `npm ci --ignore-scripts`; run `npm test`. For the
isolated React/Host browser fixture, run `node tests/ui.browser.mjs` after installing
a local Playwright Chromium, or set `WHITEBOARD_CHROMIUM` to an executable path.
No live provider or desktop-app operation is required by these tests.

The Host uses `storageDomain`, while the Client keeps local board copies and merges
shared changes. Prompt receipts and native session links are preserved across
canvas Undo/Redo. Cursors follow live session events; historical events do not
replay tours. Reduced motion disables spatial cursor transitions and tours.

Handed notes send a short quote and exact note id. The agent reads full details
through board tools instead of receiving a board dump. Native permissions and
approvals remain DSH responsibilities. Sharing is off until enabled in Settings.

The bundle manifest and cordis.patch.yml are included for DSH installation. Keep
actual board storage, session history, private profile files and verification
artifacts outside Git. Restart DSH after installing runtime changes.

Originally ported from https://github.com/Adolanium/hermes-whiteboard.

