# Power BI Live Designer — controlled file authoring

This DSH bundle verifies a local coordinator and the exact PBIP project, inspects local semantic metadata without querying rows or changing the model, persists design proposals and review findings, and shows operation evidence beside chat. DSH authors the files; the plugin stages, validates, checkpoints and applies them only after exact native-user approval. Guarded definition reload and approved model-data refresh are separate, journaled operations.

## Start

Open the PBIP in Power BI Desktop. From this bundle directory, run `./start-coordinator.ps1 -Project '<full PBIP path>' -Port 8766`. The hidden Python coordinator uses the installed `powerbi-report-author` CLI for read-only Desktop status. Choose another port if occupied; the launcher does not terminate unrelated processes. For a PBIX, first save a separate PBIP copy in Desktop. Keep the original PBIX.

The bundle does not automatically spawn the coordinator. Bind it with `pbi_configure` or the sidebar's Connect button. Configuration checks the service's actual project; a mismatched project is rejected, and a failed connection does not overwrite an existing verified binding. Desktop availability and unsaved changes are reported separately. The last check is not a promise of ongoing connectivity or source-data freshness.

## Skills and feedback

The plugin registers four skills through DSH's native registry when that service is available: `analysis-report-workflow`, `dashboard-design-process`, `dashboard-design-patterns`, and `dashboard-design-review`. References retain filesystem resource directories and load on demand. The general workflow coordinates the user's design skills, progressive business questions, a reviewable proposal, verification, bounded recovery, and optional Dreamer lesson proposals. See SKILLS-SOURCE.md and LICENSE.skills for upstream attribution and local adaptations.

`pbi_plan_design` saves a proposal containing audience, questions, metrics, assumptions, and pages whose visuals specify question, measure, dimension and acceptance. `pbi_record_review` records user feedback or an agent finding with expected/observed results, evidence, severity and next action. These operations write planning records only; neither approves execution or edits report files. Their server validates structure, not measure semantics. Keep credentials, private rows and private reasoning out of these records.

## Tools

| Tool | Behavior |
|---|---|
| `pbi_configure` | Verify and bind a loopback origin and actual project |
| `pbi_check_connection` | Recheck project, service, and structured Desktop status |
| `pbi_validate_project` | Read authoring-CLI validation separately from Desktop readiness; preserve incomplete-coverage warnings |
| `pbi_get_status` | Read coordinator state and the last connection check |
| `pbi_inspect_semantic_model` | Inventory local TMDL or BIM metadata only |
| `pbi_plan_design` | Persist a bounded design proposal |
| `pbi_record_review` | Record feedback/findings; never grants approval |
| `pbi_get_operation_log` | Read coordinator outcomes and session-filtered host attempts, including when offline |
| `pbi_plan_refresh` | Retained legacy deterministic refresh planning; no Desktop mutation |
| `pbi_run_approved_refresh` | Disabled by default at both host and coordinator |
| `pbi_capture_page` | Optional screenshot evidence through the matching coordinator |
| `pbi_get_artifact` | Save a captured PNG into the session workspace |
| `pbi_abort_if_safe` | Clear host pending state; does not interrupt a running operation |

## Inspection limits and safety

Semantic inspection follows local PBIP/report references within the project directory, with file and byte budgets. It returns names and relationships, not rows, connection strings, M or DAX expressions. TMDL inventory is partial: types, hierarchies and full semantic meaning are not validated. Remote semantic models are unsupported. Empty models are reported explicitly. Disk definitions can differ from unsaved Desktop state.

The coordinator's append-only `.runtime/<project-key>/operations.jsonl` journal records started, succeeded, failed, blocked and unknown outcomes; an unfinished started record remains unresolved after interruption. A separate host journal records session-scoped service attempts even when the coordinator cannot be reached. Correlation ids pair starts with terminal outcomes. Diagnostics record error types rather than raw CLI output or request bodies. Design-review findings are deliberate user/agent records, separate from private reasoning. A timeout is unknown and must be investigated before repeating a write. Journals currently have no automatic rotation.

The legacy refresh runner stays disabled. Use the native-user-approved model refresh workflow below. Read-only semantic inspection is unchanged; unsaved-change guards apply before reload and processing. No UI automation is used.

## Verification

Run `npm test` and `npm run test:python`. Tests use local fixture files and mock coordinators. `verify-native-skills.mjs` additionally checks discovery/loading through DSH's packaged skill registry in Electron Node mode, without a model call or GUI control. These checks do not establish visual sidebar appearance or analytical correctness. Reopen DSH after installing host changes; the installer refuses to replace plugin files while the app is running.

## Proposal schemas and diagnostics

`design-contracts.js` describes every accepted nested proposal/review field, including closed objects, list bounds and review enums. The coordinator independently validates submitted values. Proposed bindings belong in measure/dimension; extra binding fields are rejected. The workflow loads aggregation-rules.md before defining metrics.

New Desktop journal records identify actions such as desktop:validate or desktop:reload, safe diagnostic codes/counts, CLI exit code, and external dispatch state. Raw CLI diagnostics and request bodies are excluded. Nested operations retain external-effect evidence. Historical generic desktop-action entries remain unchanged and cannot establish whether a write was attempted. Structured validation failures block reload even when the CLI exits with code zero. `lastValidation` and Desktop readiness are separate observations; an unreachable schema means incomplete coverage.

## Generic controlled authoring

DSH prepares report/model definition changes; this plugin does not choose charts or generate a business report. Use pbi_stage_changes with a saved plan id, summary and explicit UTF-8 files (path, content, beforeSha256; null for a new file). Only definitions inside the bound PBIP/report/model are accepted. Deletion, reference relocation, scripts, binaries and linked targets are unsupported. The returned digest and diff identify exactly what the user reviews.

pbi_validate_changes validates the isolated report with the real authoring CLI and deserializes the isolated model through Microsoft's offline modeling server. Any schema coverage warning or missing validator blocks approval. Offline parsing does not prove DAX results, data loading or visual appearance. The modeling server must already have its EULA accepted explicitly by the user. The launcher reads the configured executable from .runtime/modeling-server.path; the operator must explicitly authorize EULA acceptance before the acceptance marker is provisioned.

The user runs /pbi review ID, then /pbi approve ID SHA256 after reviewing the exact diff. No model-facing approval tool or approval HTTP proxy is registered. The private coordinator control token stays on the host. pbi_apply_changes requires the same session, project, digest, successful validation, unchanged source/staged files and a clear Desktop unsaved-state preflight. It checkpoints affected files before replacement. Approval cannot be reused after application.

pbi_reload_changes checks the applied hashes, validates again and rechecks unsaved Desktop state before invoking report-only or model-definition reload as appropriate. It does not import/refresh rows or verify analytical results. Unknown reload outcomes block automatic retries. The user-only /pbi rollback ID SHA256 restores checkpointed files only if they remain at the applied version; subsequent edits block recovery. File rollback does not restore Desktop's in-memory state or undo data processing. Interrupted application remains visible and may require operator recovery.

Legacy attach/reload/refresh-run HTTP endpoints are disabled so they cannot bypass the approved-change path. Read-only inspection, design planning, review, capture and journaling remain available. Synthetic fixture tests cover authorization denial, stale approvals, cross-session access, path escapes, partial failure restoration and later user edits. Real CLI and Microsoft offline parsing are checked on a synthetic project; no live business report is edited by those tests.


### Task-authorized model-data refresh (0.4.1)

Following approved file application and successful definition reload, `pbi_stage_model_refresh` prepares exact table Full refreshes with live-model/source fingerprints and row-count acceptance ranges. `/pbi refresh-review ID` optionally displays the plan. Refresh inherits authorization from the approved, applied, successfully reloaded change set in the same session; it does not require a separate `/pbi refresh-approve` command. `pbi_run_model_refresh` performs the exact staged operation; `pbi_get_model_refresh` reads its persisted evidence. Microsoft modeling EULA acceptance is reused from this operator's explicit authorization via `.runtime/modeling-eula-accepted`.

The adapter journals intent before each write through an acknowledgment handshake. Completed tables, verification failures and unknown outcomes survive coordinator restarts. An interrupted/unknown attempt cannot be retried or bypassed by restaging on the same Desktop instance. File rollback cannot undo processed rows. Row-count verification is distinct from DAX/business correctness and visual review. No live queries or writes are added to the metadata-inspection tool. Parent authorization is revalidated at execution; a removed approval, rolled-back parent, changed project/source/model, different session, or uncertain prior refresh blocks automatic processing. Existing staged refresh records can use the same inherited authorization without restaging solely for this upgrade.

Testing separates mocked processing/transport tests from real Microsoft discovery and offline validation. A successful mocked refresh is not evidence that the user's Desktop model has been processed.


### Live execution fixes (0.4.2)

Stage requests use the coordinator's `{value, sessionId}` envelope. Synchronous Microsoft refresh calls may acknowledge success with `isError: false` and an empty content array; row counts are still queried separately. The model adapter verifies the exact open PBIP path through Desktop Bridge and maps that window to its Analysis Services child process; titles are not identity. The Desktop Bridge dependency comes with the report-authoring CLI; set `PBI_DESKTOP_BRIDGE_MODULE` if it is installed outside the standard per-user npm location.

A successful table refresh is followed by report-only redraw and a second row-count verification. The operation never reloads model definitions after processing. A replay of an already completed definition reload is a no-op if the complete source snapshot still matches. If a redraw completed but its read-only verification failed, a retry only repeats verification. Unknown redraw outcomes remain blocked.

Capture evidence records project, requested page, returned page acknowledgment, timestamp, image hash and warm-capture provenance. Wrong-page and failed-render captures are not exposed as valid images; identical bytes across different pages are labeled unverified, not proof of caching. A valid capture still needs visual review. Renderer error codes are retained in the journal.
