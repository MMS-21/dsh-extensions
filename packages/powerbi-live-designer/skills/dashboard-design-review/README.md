# Dashboard Design Review — skill

A task skill for critiquing a dashboard and finding what it is missing: the verification checklist, common pitfalls, accessibility, and responsiveness.

Part of a small dashboard-design set:

| Skill | Question it answers |
|---|---|
| `dashboard-design-patterns` | What patterns, genres, tradeoffs, and guidelines exist? |
| `dashboard-design-process` | How do I design this dashboard, end to end? |
| `dashboard-design-review` (this one) | Is this dashboard good, and what is it missing? |

## What's inside

```
dashboard-design-review/
├── SKILL.md            # the review pass
├── README.md           # this file
└── agents/openai.yaml  # Codex metadata
```

## When to use it

Load it to review, critique, or QA a dashboard (mockup, live page, BI report), or to check a design against the Dashboard Design Patterns guidance before shipping.

## How it relates to the reference skill

The review criteria come from `dashboard-design-patterns`:

- `references/content-patterns.md` and `references/composition-patterns.md` — the patterns and their prevalence
- `references/tradeoffs.md` — the four-parameter balance
- `references/process-guidelines.md` — the 20 + 8 guidelines
- `references/paper-notes.md` — workshop findings on accessibility and responsiveness

## Install

Follows the [Agent Skills open standard](https://agentskills.io/specification). Install from the repository root:

```bash
npx skills add MMS-21/agent-skills -a claude-code   # or codex, opencode, cursor, ...
```

Or copy/symlink this folder into the skills directory your agent reads (for example `~/.agents/skills/dashboard-design-review`). See the repository root [`README.md`](../../README.md) for the full per-agent path table.

## Sources & attribution

- Site: https://dashboarddesignpatterns.github.io/processguidelines.html and `patterns.html`
- Paper: Bach et al., *Dashboard Design Patterns*, IEEE VIS 2022 / TVCG 2023. https://arxiv.org/abs/2205.00757

Independent distillation for educational/practical use; all credit for the patterns goes to the original authors.

## License

MIT — see the repository `LICENSE`.
