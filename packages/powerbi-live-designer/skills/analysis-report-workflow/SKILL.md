---
name: analysis-report-workflow
description: Plan, design, review, and verify analytical reports or dashboards with user feedback. Use for an end-to-end analytical design task; use the Power BI reference when the target is Power BI Desktop.
---

# Analysis and report workflow

Use the user's dashboard design skills as the design baseline. This workflow coordinates them with the target application's capabilities; it grants no additional execution permissions.

## Understand and inspect

For Power BI, first establish the target with the user. If they have not already named it explicitly, ask “Which Power BI report should I connect to, or should I create a new one?” Wait for the answer before calling Power BI tools. A dataset path alone does not identify a report. Use [the adapter reference](references/powerbi.md) to choose the connection route. For a data-only refresh, follow that route directly and skip design work.

For a design task, ask who the report serves and which decisions it should support, unless already known. Inspect available semantic metadata before asking questions that inspection can answer. Complete this stage with a brief distinguishing model facts, user-confirmed definitions, proposed business concepts, and unanswered questions. Business metric meanings, grain, thresholds, and relationship ambiguity require confirmation; reversible layout choices can use the design defaults. A proposed ontology is a labeled suggestion, never an inferred fact or automatic model edit.

## Design and feedback

Load `dashboard-design-process` to create the design, `dashboard-design-patterns` for relevant references, and its `references/design-baseline.md` for defaults. Before defining measures or analytical bindings, read [aggregation rules](references/aggregation-rules.md). Finish with a concrete page plan, existing model bindings or explicitly unbound proposals, filters, assumptions, and acceptance checks. Use a compact visual preview when supported and ask for feedback on the proposed design before changing report files. Record the plan through the adapter when available. Preserve revision links rather than making the user repeat their brief.

## Execute and verify

Load `dashboard-design-review` before execution and again against the actual result. Execute only operations the adapter explicitly supports and the user has authorized. Record operation outcomes and evidence in its journal. A successful tool call alone does not establish analytical correctness. Compare expected and observed results: screenshots establish appearance; metadata bindings and independently checked query results establish analytical evidence. Mark unavailable checks unverified rather than passed. Complete only when acceptance checks pass or remaining limitations and blockers are explicitly reported.

## Recovery and reflection

On timeout or a lost response, mark the outcome unknown and inspect current state before repeating a write. Preserve partial-success evidence; use rollback only when the adapter exposes a verified checkpoint. Make at most one targeted correction for the same failure before stopping affected work and presenting options. For every material defect, record expected result, observed result, evidence references, severity, next action, and outcome using the adapter's review operation. Store conclusions and decisions, not private reasoning.

For a reusable lesson, consult Dreamer's current workspace learning mode and tools when available. Propose a lesson with actual session evidence through its existing reviewed learning cycle; do not create another memory store, auto-accept a lesson, or alter a skill silently. If Dreamer is unavailable, keep the task finding in the operation journal and report that long-term learning was not submitted.
