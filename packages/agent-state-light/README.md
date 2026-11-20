# Agent state light

A small Web client plugin for the DeepSeek Harness chat shell. It adds a glowing
traffic-light indicator to the composer dock at the bottom of the chat, so the
agent's current state is visible at a glance.

## What it shows

Four dots — red, yellow, green, blue — with the active state glowing and a short
label beside it. Hovering the row shows the meaning of each color.

| Color | State | Meaning |
|---|---|---|
| Blue | Working | A turn is running, or a prompt is in flight |
| Yellow | Waiting for you | The agent is blocked on an approval or a question |
| Green | Ready | Idle, loaded, nothing outstanding |
| Red | Error | The session reported an error or was removed |

## How it works

The component is registered into the `conversation.composer.dock` slot (order 5,
after the built-in activity/usage pills and the render-ui status line). It reads
only the shell's existing seats, so it updates with the durable session log and
needs no model turn of its own:

- `useSession` — `running`, `removed`, `openState`, `openError`, `lastAgentError`,
  `promptError`
- `useSessionStatus` — the per-session `pendingInteraction`
- `useInput` — the composer `phase` (a prompt in flight also reads as working)

## Files

- `client.js` — the browser artifact: locale dictionaries, styles, the component,
  and the dock registration.
- `index.js` — the Host row; it does nothing, the Client module owns rendering.
- `cordis.patch.yml` — inserts the `agent-state-light` row.
- `locale/*.json` — Plugin Manager display metadata.
- `icon.svg` — the traffic-light icon.

## Installation

Installed as a profile bundle with `plugin_manager` → `install_bundle`, pointing
at this directory. The Desktop profile links the directory, so edits to
`client.js` are picked up by the client HMR poll and hot-swapped into the running
page. Removing the bundle from the profile removes the indicator.

## Verification

`node scratchpad/verify-state-light.mjs` loads the real `client.js` with the
Desktop profile's React 18, registers it against a mock client context, and
renders every state. The live GUI was also confirmed: while a turn runs the row
shows a glowing blue dot and the label "Working".
