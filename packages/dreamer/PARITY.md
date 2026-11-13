# Hermes Dreamer 1.5.0 → DSH parity audit

Audited against the pinned upstream source in SOURCE.md, not just its README.

| Upstream behavior | DSH port |
| --- | --- |
| Three tools: dream_now, dream_journal, dream_status | Implemented with native tool registration |
| /dream and /dream now | Implemented when DSH's commands service is mounted; also /dream status and journal |
| Idle generation and minimum interval | Implemented; no active session; startup idle grace; bounded/cancellable calls |
| Enabled/master switch and topic hint | Implemented; disabled means manual generation is disabled too |
| Current-profile historical residue | Read-only DSH persistence backfill plus live events; no Hermes state.db dependency |
| Session/message/tool/error summaries | Bounded observations, top tool names and first-class failure flags |
| Token counts | Included when retained message metadata contains usage; otherwise unavailable, never invented |
| Appreciative/problem-message friction | Deterministic markers included; approximate signals rather than inferred emotions |
| Two-week distance / old failure residue | Up to 50 sessions created in the last 14 days, latest 200 events each; old failure samples retained separately |
| Still-open work | Current running sessions block idle generation; old failure markers are not falsely claimed to prove unresolved work |
| Light/deep phases, deep idle band and every fifth dream | Implemented, with a cumulative counter independent of journal length |
| Larger deep token budget | At least 1200 output tokens; normal default 900 |
| Previous-dream continuity and three-dream arc | Implemented with prior insight targets and recent class history |
| Grounding, narrative length gate, one retry | Implemented; every insight cites exact supplied observation ids |
| Per-insight targets | Stored as paired text/target/evidence objects in one journal update |
| Partial retry merging | Deliberately not copied: both attempts must pass the full gate; no half-valid dream is saved |
| Follow-up tracking quota/ledger | Keyword-trace ledger excluding wake messages; explicitly not proof of implementation |
| Symbol code meanings and 30-day decay | Implemented; meanings come from structured model output, not narrative fragments |
| A new symbol outside the old lexicon | Prompted; not represented as a guaranteed enforced condition |
| Dream classes and measured imbalance counter | Implemented for the last five classes; drift visible in status |
| Durable journal and no fabricated provider fallback | Implemented; complete accepted journal retained, failures stay failures |
| Compact first-turn wake, latest undelivered dream | Implemented; 48-hour expiry; exclusive reservation and admission acknowledgement |
| Wake echo cannot confirm earlier insights | Implemented by source-kind filtering in both live and history readers |

## Intentional platform/behavior differences

- The scheduler is a DSH-owned disposable timer, not a Python daemon thread.
- Generation uses an explicit provider/model pair when configured, otherwise the
  last route recorded by a real DSH request. It does not guess a new GUI selection
  that has never been used. Reasoning effort is minimized when advertised.
- Automatic failures are interval-limited using lastAttemptAt as well as lastDreamAt;
  upstream mostly limits successful dreams. Manual retries remain explicit.
- Historical input is sampled, not a complete database scan. Sessions created more
  than 14 days ago can still contribute through recently observed live events.
  Counts describe that bounded sample; token usage missing from message metadata
  is unknown. DSH's active-turn status is not equivalent to Hermes ended_at.
- No SQLite journal import, source-database modification, file edits, tool actions,
  account operations or autonomous execution of insights occur.
- Wake claims are acknowledged only after the injected message enters DSH's log.
  Abandoned pre-admission claims expire or release at turn end. Catastrophic storage
  failure can prevent acknowledgement; status reports storage errors rather than
  claiming a universal exactly-once delivery guarantee.

This is a native port with the above documented differences, not a claim of bit-for-bit parity.
