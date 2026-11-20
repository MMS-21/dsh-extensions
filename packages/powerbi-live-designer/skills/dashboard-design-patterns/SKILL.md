---
name: dashboard-design-patterns
description: Design dashboards with patterns, genres, tradeoffs, process.
license: MIT
metadata:
  version: 0.2.0
  author: Moaaz Magdy (MMS-21), Hermes Agent
  compatibility: "Claude Code, Codex, Cursor, Copilot, Gemini, OpenCode, Pi, Windsurf, Hermes, DSH"
  hermes:
    tags: [dashboard, design, visualization, ui, patterns, ux]
    related_skills: [dashboard-design-process, dashboard-design-review]
---

# Dashboard Design Patterns

A practical catalog of dashboard design knowledge distilled from [dashboarddesignpatterns.github.io](https://dashboarddesignpatterns.github.io/) (Bach et al., *Dashboard Design Patterns*, IEEE VIS 2022 / TVCG 2023), derived from a systematic review of 144 dashboards. Use it to make deliberate, defensible dashboard design decisions instead of guessing.

**Does not cover:** Tableau/Power BI tooling tutorials, programming visualizations (d3.js), or certification.

This file is the lean, always-loaded index. The detailed material lives in `references/` — load only what the task needs.

## When to Use

Load this skill when the user:

- Is designing, reviewing, or refactoring a dashboard (web, BI, analytics, embedded).
- Asks how to lay out widgets, choose charts, structure pages, or use color.
- Needs to pick a dashboard genre (static, magazine, infographic, mini, analytic, repository).
- Is stuck on screenspace, page count, abstraction, or interactivity tradeoffs.
- Wants dashboard design guidelines or best practices.
- Asks whether a dashboard is missing something (use `dashboard-design-review`).

**Don't use for:** implementing chart code, data pipelines, or non-dashboard UI.

## Quick Reference

### The 8 pattern groups

Two super-groups:

- **Content** — what is shown: **Data Information**, **Meta Information**, **Visual Representations**.
- **Composition** — how it is arranged: **Screenspace**, **Page Structure**, **Page Layout**, **Interactions**, **Color**.

Patterns are **not mutually exclusive** and are designed to be combined. Prevalence percentages (from the 144-dashboard corpus) are in the references.

### The 6 genres

**Curated** (author-driven, selective): Static, Magazine, Infographic, Embedded Mini.
**Data collection** (reader-driven, high volume): Analytic, Repository.

### The 4 tradeoff parameters

**Screenspace**, **number of pages**, **abstraction**, **interactivity**. Ideally minimize all four; minimizing one requires increasing one or more of the others (stress metaphor).

## References — load on demand

Load with `skill_view(file_path=...)` (Hermes) or read the file relative to this skill.

| File | Load this when |
|---|---|
| `references/design-baseline.md` | Applying default typography, spacing, formats, page conventions and design acceptance checks |
| `references/content-patterns.md` | Choosing what information to show and how to encode it; abstraction level; meta information; visual representation choices |
| `references/composition-patterns.md` | Choosing screenspace strategy, page structure, page layout, or color scheme |
| `references/genres.md` | Deciding what type of dashboard to build, or checking a genre's characteristic patterns |
| `references/tradeoffs.md` | Negotiating screenspace / pages / abstraction / interactivity; defending a design decision |
| `references/process-guidelines.md` | Running the staged design process or applying the 20 + 8 guidelines |
| `references/paper-notes.md` | Need the paper's design framework, limitations, methodology, accessibility, or open questions |
| `references/workshop.md` | Running or teaching a dashboard design workshop |

## Related skills

- **`dashboard-design-process`** — drive a dashboard from context to mockup (Stage 0-6 + the tradeoff procedure).
- **`dashboard-design-review`** — critique a dashboard against the checklist, pitfalls, accessibility, and evidence.

## Sources & attribution

- Site: https://dashboarddesignpatterns.github.io/ (`patterns.html`, `types.html`, `tradeoffs.html`, `processguidelines.html`, `workshop.html`, `paper.html`)
- Paper: Bach, Freeman, Abdul-Rahman, Turkay, Khan, Fan, Chen, *Dashboard Design Patterns*, IEEE VIS 2022 / TVCG 2023. https://arxiv.org/abs/2205.00757
- Full links (talk, coding sheet, dashboard collection, cheatsheets, workshop materials) are in `references/paper-notes.md` and `references/workshop.md`.

This is an independent distillation for educational/practical use; all credit for the patterns goes to the original authors.

## License

MIT — see the repository `LICENSE`.
