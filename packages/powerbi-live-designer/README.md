# Power BI task tools — 0.6.0

Power BI runs through the DSH chat and agent tools. There is no Power BI sidebar,
launcher, embedded designer, Agent Performance page, or manual approval click.
Ask and answer all source, design and business questions in chat.

## Start and continue

Restart DSH to load the linked update. Start a chat with your report goal and
source locations. For a new report, include an output directory and report name;
for an existing report, supply its full PBIP path or use the unique open project.
No dataset path is hardcoded. Preserve PBIX originals and use a separate PBIP copy.

1. `pbi_prepare_task` discovers Desktop, prepares the exact project, and starts or
   reuses a hidden local coordinator. Existing task context is resumed.
2. `pbi_inspect_task` reads model metadata or a bounded read-only EVALUATE query.
3. The agent follows the four bundled design skills, asks unresolved questions in
   chat, and calls `pbi_prepare_draft` with explicit files and acceptance checks.
4. `pbi_execute_task` authorizes the exact validated digest through the private
   host channel, checkpoints and applies files, reloads affected definitions,
   processes required tables, checks numeric results and captures affected pages.
   There is no separate user approval step. Validation failures or stale files stop
   execution. Authorization is recorded as `task-workflow`, never as a user click.
5. The agent reads every image and submits page/hash/review notes with `action:
   finish`. Completion requires current numeric/visual evidence and saved state.
6. `pbi_task_status` restores compact context after interruption. Never repeat an
   import or write just because conversation context was lost.

For explicitly requested data-only refreshes use `action: refresh_data` with named
tables. This skips design and file staging; it does not establish report appearance
or business metric correctness.

## Retained checks and recovery

Exact project/session identity, schema/model validation, source fingerprints,
unsaved-work checks, definition checkpoints, project locks, bounded retries,
query verification and screenshot hashes remain enforced. A timeout is unknown:
reconcile backend state before retrying. Refresh is separate from layout/model
reload; acknowledged imports are never repeated to redraw charts.

Versioned checksummed context and durable journals live under `.runtime/tasks/`.
They store bounded operation metadata, not credentials or private reasoning. The
private control token is never returned to the agent. HTTP change endpoints still
require it. Removing the manual approval step does not expose unauthenticated writes.

A new coordinator protocol identifier prevents reuse of older approval-only
coordinators. Existing task connections upgrade on bind without deleting task
records, staged files, journals or loaded data. Other processes are not terminated.
Old pending approval tasks are presented as ready for task execution.

## Design and saved output

The bundled analysis-report-workflow, dashboard-design-process,
dashboard-design-patterns and dashboard-design-review remain the design baseline.
Routine reversible choices use their defaults; unresolved meanings, source access,
authentication or conflicting user work are questions or handoffs in chat.

The optional Save helper sends Ctrl+S once to the exact verified Desktop process
and checks saved state through the bridge. `savePolicy: manual` disables it.
`setup-save.ps1` installs pinned dependencies into isolated `.runtime/python`.
Dialogs and ambiguous windows stop the helper. Changed definitions require fresh
queries and captures. The full unattended native Save path still needs separate
live qualification; the plugin is not a background AI worker after DSH stops.

## Compatibility and validation

The default surface has five task tools. `advancedTools: true` retains low-level
compatibility tools; use the task workflow for normal authoring. The old client
entry point is inert for hosts with cached metadata, and the package has no DSH
client registration. Preview and local web UI routes are removed. Standalone
reference HTML supplied by the user outside the plugin is untouched.

All tool results pass a JSON boundary that omits absent object properties and
rejects non-finite values, cycles and unsupported objects. Invalid output never
triggers an automatic retry. The previous serialization fix remains included.

- `npm test`: task, host, output-contract and absence-of-sidebar regressions.
- `npm run test:python`: coordinator, authorization and refresh regressions.
- `npm run test:dsh-json -- <resources/app.asar>`: actual installed DSH JSON validator
  against workflow fixtures, without editing DSH or a real report.

There is no browser UI left to test with e2e. Native report rendering/save and
activation in the running DSH process are separate from automated fixtures.
