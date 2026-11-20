---
name: dashboard-design-process
description: Drive dashboard design from context to mockup.
license: MIT
metadata:
  version: 0.1.0
  author: Moaaz Magdy (MMS-21), Hermes Agent
  compatibility: "Claude Code, Codex, Cursor, Copilot, Gemini, OpenCode, Pi, Windsurf, Hermes, DSH"
  hermes:
    tags: [dashboard, design, process, workflow, ux]
    related_skills: [dashboard-design-patterns, dashboard-design-review]
---

# Dashboard Design Process

A task skill that drives a dashboard from context to mockup. It operationalizes the staged process and the tradeoff procedure; the pattern catalog behind it lives in `dashboard-design-patterns`.

**Does not cover:** chart implementation, data pipelines, or tool-specific tutorials.

## When to Use

Load this skill when the user wants to:

- Design a new dashboard, or restructure an existing one.
- Plan pages, layouts, encodings, or interactions from a set of requirements.
- Turn an audience/task brief into a concrete design.

Use `dashboard-design-patterns` for lookups, and `dashboard-design-review` to critique the result.

## Procedure

Work the stages in order, but iterate — later stages often force earlier decisions to be remade.

### Stage 0 — Clarify the context

Before any design, state: **audience** (what they know; real personas), **setting** (device, interaction possible, time available, frequency), **tasks and decisions** (lookup / compare / analyze), and **information needed** (all data or the most relevant).

Ask only for consequential gaps that inspection cannot answer. Confirm business metric definitions, grain, thresholds and ambiguous relationships. Use reversible defaults for layout and record them. For visual defaults, load `dashboard-design-patterns` and read its `references/design-baseline.md`.

### Stage 1 — Data & information

Decide what information matters for the task and at what **abstraction level**: detailed datasets, individual values, derived values, aggregated data, filtered, thresholds. Load `dashboard-design-patterns` → `references/content-patterns.md`.

### Stage 2 — Structure

Single page or multiple? If multiple, define the page relationships (hierarchical, parallel, open, semantic) and what goes on each page. Duplicating information across pages is acceptable.

### Stage 3 — Visual representations

Choose encodings per page and match them to the abstraction level (detailed charts/tables for detail; numbers/trend-arrows/signature charts for at-a-glance). Where space allows, add redundant/complementary views.

### Stage 4 — Page layout

Organize widgets into a meaningful structure (stratified, grouped, table, open, schematic) that reflects relations and importance.

### Stage 5 — Screenspace

Fit everything on one screen, or reveal off-screen data interactively. Prefer screenfit comparisons in analytic dashboards; allow scrolling when the task or accessibility requirements justify it.

### Stage 6 — Interactivity

Support exploration, filter/focus, navigation, personalization — and minimize interaction where a static solution works.

## Tradeoff procedure (run at every stage)

1. Fix the parameters you cannot control (audience, devices, scenario).
2. State current values for **screenspace**, **pages**, **abstraction**, **interactivity**.
3. Choose which parameter to minimize (usually screenspace or pages).
4. Compensate by increasing one or more of the others — explicitly, with reasoning.
5. Record the decision and revisit it when the design changes.

Full model: `dashboard-design-patterns` → `references/tradeoffs.md`.

## Guidelines to apply throughout

Apply the 20 high-level guidelines and the 8 pattern-based guidelines (`dashboard-design-patterns` → `references/process-guidelines.md`). Two that matter most early: don't overwhelm viewers, and show information rather than data.

## Output

Deliver a design the user can act on: the genre, the page structure, the encodings per page, the layout, the screenspace strategy, the interactions, the color scheme, the meta information, and the tradeoffs made — plus what to verify with `dashboard-design-review`.

## Sources

- Site: https://dashboarddesignpatterns.github.io/processguidelines.html
- Paper §5.1 and §6.3: https://arxiv.org/abs/2205.00757

Complete the proposal with each visual mapped to a business question, semantic-model binding, intended interaction and observable acceptance check. Label unconfirmed bindings and ontology suggestions; obtain feedback before report edits.
