---
name: analysis-report-workflow
description: Plan, design, review, and verify analytical reports or dashboards with user feedback. Use for an end-to-end analytical design task; use the Power BI reference when the target is Power BI Desktop.
---

# Analysis and report workflow

Use the user's dashboard design skills as the design baseline. This workflow coordinates them with the target application's capabilities; it grants no additional execution permissions.

## Understand and inspect

For Power BI, prefer the five task tools when available. Call `pbi_prepare_task`
with the user's intent, supplied sources and exact project when known. Do not ask
the user to start a coordinator or select a port. The plugin discovers a unique
open PBIP; ask for a project only when discovery is ambiguous. For a new report,
choose a user-authorized output location and report name and pass `mode: new`;
the plugin creates the shell. Inspect through `pbi_inspect_task`. Use
`pbi_task_status` after interruption to recover decisions and completed stages.
Do not repeat task preparation, imports or definition reloads because conversation
context was lost. If these task tools are unavailable, use the advanced adapter
workflow below. All user questions and design feedback belong in chat; never ask the user to open a sidebar.

For an explicit data-only refresh, prepare the existing project and use
`pbi_execute_task` with `action: refresh_data` and the requested table names.
Skip design and file staging. Report observed row counts separately from
business correctness, visual appearance and saved state.

Advanced fallback only: when task tools are unavailable, identify whether the task is for a new or existing report. Ask if the intent is ambiguous. Call `pbi_start_task` with that mode to record task intent. For a new report, ask the user to open Power BI Desktop, save a new Power BI Project (.pbip), and paste its full path into chat. For an existing report, ask them to open its .pbip in Desktop and paste the full path. If the user already provided the exact saved .pbip path, use it. Call `pbi_start_task` with the confirmed path before connecting, inspecting the model or designing the report. A dataset path alone does not identify a report. Use [the adapter reference](references/powerbi.md) to choose the connection route. For a data-only refresh, follow that route directly and skip design work.

For a design task, ask who the report serves and which decisions it should support, unless already known. Inspect available semantic metadata before asking questions that inspection can answer. Complete this stage with a brief distinguishing model facts, user-confirmed definitions, proposed business concepts, and unanswered questions. Business metric meanings, grain, thresholds, and relationship ambiguity require confirmation; reversible layout choices can use the design defaults. A proposed ontology is a labeled suggestion, never an inferred fact or automatic model edit.

## Design and feedback

Load `dashboard-design-process` to create the design, `dashboard-design-patterns` for relevant references, and its `references/design-baseline.md` for defaults. Before defining measures or analytical bindings, read [aggregation rules](references/aggregation-rules.md). Finish with a concrete page plan, existing model bindings or explicitly unbound proposals, filters, assumptions, and acceptance checks. Use a compact visual preview when supported and ask for feedback on the proposed design before changing report files. Record the plan through the adapter when available. Preserve revision links rather than making the user repeat their brief.

## Execute and verify

For generated reports, prefer writing definitions and a JSON draft manifest on
disk, then call `pbi_prepare_draft` with only its absolute `manifestPath`. Files
in the manifest can use `contentPath`; do not retype or print whole files into
the conversation. Read [file-based draft submission](references/draft-manifests.md)
for the schema, allowed locations, baseline hashes and recovery rules.

With task tools, pass the design plan, explicit definition changes, affected page
IDs, task-specific acceptance criteria, scalar DAX checks, and any required exact
table refresh plan to `pbi_prepare_draft`. Continue by calling `pbi_execute_task` once the draft is validated and any
unresolved questions have been answered in chat. No sidebar or separate approval
is required. It owns apply/load/process/capture
sequencing; do not duplicate these actions using low-level tools. Read each captured
image and apply `dashboard-design-review`, then call `pbi_execute_task` with
`action: finish` and the page, captured SHA-256, passing result and review notes.
Never report a screenshot reviewed without reading it. Automatic Save is attempted
only when the task advertises that capability and policy; its result must be
confirmed by Desktop readback. An `awaiting_save` result requires saving the exact
project; it is not completion. A `needs_reverification` result requires fresh
queries and captures through execute, without repeating completed imports.
Correct a draft with
`revisionOf` equal to its current digest, preserving history and revalidating the exact draft.
Use status for uncertain outcomes, not a blind execute retry. The four dashboard
design skills remain the design authority; the task runner does not replace them.

Load `dashboard-design-review` before execution and again against the actual result. Execute only operations the adapter explicitly supports and the user has authorized. Record operation outcomes and evidence in its journal. A successful tool call alone does not establish analytical correctness. Compare expected and observed results: screenshots establish appearance; metadata bindings and independently checked query results establish analytical evidence. Mark unavailable checks unverified rather than passed. Complete only when acceptance checks pass or remaining limitations and blockers are explicitly reported.

## Recovery and reflection

On timeout or a lost response, mark the outcome unknown and inspect current state before repeating a write. Preserve partial-success evidence; use rollback only when the adapter exposes a verified checkpoint. Make at most one targeted correction for the same failure before stopping affected work and presenting options. For every material defect, record expected result, observed result, evidence references, severity, next action, and outcome using the adapter's review operation. Store conclusions and decisions, not private reasoning.

For a reusable lesson, consult Dreamer's current workspace learning mode and tools when available. Propose a lesson with actual session evidence through its existing reviewed learning cycle; do not create another memory store, auto-accept a lesson, or alter a skill silently. If Dreamer is unavailable, keep the task finding in the operation journal and report that long-term learning was not submitted.
