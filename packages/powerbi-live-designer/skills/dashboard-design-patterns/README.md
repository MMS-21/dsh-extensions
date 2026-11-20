# Dashboard Design Patterns — skill

A practical catalog of dashboard design knowledge, distilled from the [Dashboard Design Patterns](https://dashboarddesignpatterns.github.io/) research (Bach et al., IEEE VIS 2022 / TVCG 2023), based on a systematic review of **144 dashboards**.

This folder is the **reference** skill in a small dashboard-design set. It answers *"what are my options?"* — patterns, genres, tradeoffs, guidelines, process, workshop material. The companion skills answer *"how do I do it?"* and *"is it good?"*:

| Skill | Question it answers |
|---|---|
| `dashboard-design-patterns` (this one) | What patterns, genres, tradeoffs, and guidelines exist? |
| `dashboard-design-process` | How do I design this dashboard, end to end? |
| `dashboard-design-review` | Is this dashboard good, and what is it missing? |

## What's inside

```
dashboard-design-patterns/
├── SKILL.md                     # lean, always-loaded index
├── README.md                    # this file
├── agents/openai.yaml           # Codex metadata
├── examples/
│   └── analytic-dashboard-tradeoff.md
└── references/                  # load on demand
    ├── content-patterns.md      # data information, meta information, visual representations (+ prevalence)
    ├── composition-patterns.md  # screenspace, structure, page layout, color (+ prevalence)
    ├── genres.md                # 6 genres, curated vs collection, checklists (+ prevalence)
    ├── tradeoffs.md             # 4 parameters, stress model, information-theoretic rationale
    ├── process-guidelines.md    # 20 + 8 guidelines, Stage 0-6, double diamond
    ├── paper-notes.md           # design framework, limitations, methodology, accessibility
    └── workshop.md              # activities, findings, materials
```

## How to read it

`SKILL.md` is intentionally lean so it can stay in context. When a task needs depth, load one reference:

- Choosing encodings or abstraction → `references/content-patterns.md`
- Choosing screenspace, structure, layout, color → `references/composition-patterns.md`
- Choosing a genre → `references/genres.md`
- Defending a tradeoff → `references/tradeoffs.md`
- Running the process → `references/process-guidelines.md`
- Teaching a workshop → `references/workshop.md`

Each reference carries the **prevalence percentages** from the paper, so you can prioritize patterns that are common over patterns that are rare.

## What it covers

- **8 pattern groups / 42 patterns** — Data Information, Meta Information, Visual Representations, Interactions (content); Screenspace, Page Structure, Page Layout, Color (composition).
- **6 dashboard genres** — Static, Magazine, Infographic, Embedded Mini (curated); Analytic, Repository (data collection), with characteristic pattern checklists.
- **Design tradeoffs** — the 4 parameters (screenspace, pages, abstraction, interactivity) and the stress model.
- **20 high-level guidelines + 8 pattern-based guidelines**.
- **Staged design process** (Stage 0-6) and the workshop worksheet flow.
- **Pitfalls, accessibility, responsiveness**, and a verification checklist.

It does **not** cover Tableau/Power BI tutorials, programming visualizations (d3.js), or certification.

## Install

Follows the [Agent Skills open standard](https://agentskills.io/specification): a folder with `SKILL.md` at its root. Install from the repository root:

```bash
npx skills add MMS-21/agent-skills -a claude-code   # or codex, opencode, cursor, ...
```

Or copy/symlink this folder into the skills directory your agent reads (for example `~/.agents/skills/dashboard-design-patterns`, which Claude Code, Codex, Cursor, Copilot, Gemini, OpenCode, and Pi all read; DSH reads `.agents/skills/` and `.claude/skills/`).

See the repository root [`README.md`](../../README.md) for the full per-agent path table.

## Sources & attribution

- Site: https://dashboarddesignpatterns.github.io/
- Paper: Bach, Euan Freeman, Alfie Abdul-Rahman, Cagatay Turkay, Saiful Khan, Yulei Fan, Min Chen. *Dashboard Design Patterns*. IEEE VIS 2022 / IEEE TVCG 2023. https://arxiv.org/abs/2205.00757

Independent distillation for educational/practical use; all credit for the patterns goes to the original authors.

## License

MIT — see the repository `LICENSE`.
