---
name: dashboard-design-review
description: Review and critique dashboards against evidence.
license: MIT
metadata:
  version: 0.1.0
  author: Moaaz Magdy (MMS-21), Hermes Agent
  compatibility: "Claude Code, Codex, Cursor, Copilot, Gemini, OpenCode, Pi, Windsurf, Hermes, DSH"
  hermes:
    tags: [dashboard, design, review, critique, accessibility, ux]
    related_skills: [dashboard-design-patterns, dashboard-design-process]
---

# Dashboard Design Review

A task skill for critiquing a dashboard and finding what it is missing. It turns the catalog's verification checklist and pitfalls into a review pass, and adds accessibility and responsiveness.

**Does not cover:** rewriting the dashboard's code, or deciding business KPIs.

## When to Use

Load this skill when the user wants to:

- Review, critique, or QA a dashboard (a mockup, a live page, a BI report).
- Find what a dashboard is missing before shipping.
- Check a design against the Dashboard Design Patterns guidance.

Use `dashboard-design-process` to fix what this skill finds; `dashboard-design-patterns` for the underlying reference.

## Review pass

### 1. Context

- [ ] Audience, setting, tasks, and information needs are clear.
- [ ] The genre fits the audience and use (analytic/repository for experts; magazine/infographic for novices).

### 2. Content

- [ ] Abstraction level is chosen and justified (not everything at raw detail).
- [ ] Meta information present: data source, disclaimer, description, update information; annotations where needed.
- [ ] Encodings match the abstraction; redundant/complementary views where space allows.

### 3. Composition

- [ ] Page structure justified (single vs multi; relationship type).
- [ ] Layout expresses widget relations and importance.
- [ ] Screenspace strategy chosen; screenfit comparisons preferred, with task-based exceptions documented.
- [ ] Interactivity minimized to what is needed.

### 4. Color and clarity

- [ ] Consistent color scheme across the dashboard.
- [ ] Color is not used where unnecessary (especially screenfit dashboards).
- [ ] No visual clutter; charts grouped by attribute, ordered by time where relevant.

### 5. Tradeoffs

- [ ] The four parameters (screenspace, pages, abstraction, interactivity) are acknowledged and balanced, with reasoning.

### 6. Accessibility and responsiveness

- [ ] Sufficient contrast; color is not the only channel (not red/green alone).
- [ ] Titles and labels readable at dashboard density; keyboard/focus and screen-reader semantics considered.
- [ ] Chart sizes and text legible; interaction targets usable.
- [ ] The design degrades sensibly to smaller screens (abstraction/pages/interaction adapt, not just reflow).

### 7. Evidence check

- [ ] Common patterns are used where appropriate (see prevalence in `dashboard-design-patterns` → `references/`); choices are justified by user tasks; prevalence is descriptive, not a quality score.

## Output

Report, in priority order: **blockers** (missing context, no meta info, unjustified overflow that prevents required comparisons, inaccessible color), then **improvements** (layout, redundancy, interaction minimization), then **nits**. For each, say which pattern/guideline it violates and what to change.

## Sources

- Site: https://dashboarddesignpatterns.github.io/processguidelines.html and `patterns.html`
- Paper §5.2 (workshop findings, including accessibility and responsiveness): https://arxiv.org/abs/2205.00757

For each material finding, record expected result, observed result, evidence, severity and next action. Mark checks not performed as unverified. Screenshot evidence supports appearance, not measure correctness or keyboard accessibility. Review against the approved brief and the patterns skill design baseline; do not invent confirmed business definitions.
