# Dreamer for DSH

Idle reflection on recent work, a private dream journal, and compact context for
the next fresh chat. Model-generated reflections are observations, never orders.
Insights are not executed. No Computer Use is involved.

## What is included

Three tools (`dream_now`, `dream_journal`, `dream_status`), `/dream` commands where
the commands service is available, idle scheduling, light/deep phases, cumulative
five-dream rhythm, measured mood/friction, evidence/quality gates, one retry,
continuity and class drift, symbol meanings/decay, and an echo-excluding follow-up
ledger. See PARITY.md for exact coverage and differences from Hermes 1.5.0.

Default automatic settings: 15 idle minutes, at least 720 minutes between attempts,
deep band 60–480 idle minutes or every fifth dream, 900 output tokens for light
dreams and at least 1200 for deep dreams, 240-second deadline, up to one quality
retry, and a wake digest capped at 2000 characters. Output uses the most recently
logged DSH model route unless provider and model are explicitly configured.

These are real provider calls and use the existing DSH provider's usage quota.
The port does not add credentials or a new provider. No live provider calls were
made during implementation tests.

## Install and test

Run `npm ci --ignore-scripts --legacy-peer-deps` here, then `npm test`.
Install this directory as a DSH bundle (`@local/dsh-plugin-dreamer`) using the
included patch. The installer script can prepare/install the local bundle into
the Desktop profile; it keeps backups and validates the profile before changes.
Restart DSH after installing.

Start with `dream_status` or `/dream status`: those are read-only, cost no model
call and should show an empty journal. After some normal chat activity, use
`dream_now` or `/dream now`. Use `dream_journal` or `/dream` to read the result.
A fresh chat receives the newest recent undelivered dream. Set automatic=false
to permit manual dreams only; enabled=false disables all generation and wake.

## Private storage and history bounds

The native storageDomain named dreamer stores the accepted journal and a rolling
500-observation redacted ledger outside this Git repository. Read-only history
backfill samples 50 sessions created within 14 days, up to 200 events each. The
model gets at most 120 observations in a 24,000-character context plus a short
topic/quality note. Reasoning blocks and prior injected wake messages are excluded.
Basic credential redaction reduces obvious leaks but is not a universal secret
detector; reflections still summarize private chat content for the configured model.

The exact auxiliary request is recorded in native plugin audit records before
dispatch. Provider errors, partial outputs, invalid evidence and failed storage
do not become fake dreams. Journal reads are bounded; accepted dreams are retained.

## Verification

Unit tests cover scheduling, evidence/quality checks, no-tool generation, retries,
shutdown/cancellation, persistence, class drift, phase rhythm, read-only backfill,
wake admission/expiry and slash-command behavior. verify-runtime.mjs runs using
packaged Electron with ELECTRON_RUN_AS_NODE=1 and an optional DSH_RUNTIME_ROOT.
It uses real rc.3 services with a deterministic fixture adapter and synthetic
sessions, not live credentials, old chats or a real provider.

Native implementation targets DSH 0.2.2-rc.3. Source attribution is in SOURCE.md.
