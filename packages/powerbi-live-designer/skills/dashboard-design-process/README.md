# Dashboard Design Process — skill

A task skill that drives a dashboard from context to mockup: the staged Stage 0-6 process plus the four-parameter tradeoff procedure.

Part of a small dashboard-design set:

| Skill | Question it answers |
|---|---|
| `dashboard-design-patterns` | What patterns, genres, tradeoffs, and guidelines exist? |
| `dashboard-design-process` (this one) | How do I design this dashboard, end to end? |
| `dashboard-design-review` | Is this dashboard good, and what is it missing? |

## What's inside

```
dashboard-design-process/
├── SKILL.md            # the workflow
├── README.md           # this file
└── agents/openai.yaml  # Codex metadata
```

## When to use it

Load it when designing a new dashboard or restructuring an existing one, or when turning an audience/task brief into pages, layouts, encodings, and interactions.

## How it relates to the reference skill

The workflow references `dashboard-design-patterns` for the underlying catalog:

- `references/content-patterns.md` — abstraction and encodings
- `references/composition-patterns.md` — screenspace, structure, layout, color
- `references/genres.md` — choosing the dashboard type
- `references/tradeoffs.md` — the four-parameter stress model
- `references/process-guidelines.md` — the 20 + 8 guidelines

## Install

Follows the [Agent Skills open standard](https://agentskills.io/specification). Install from the repository root:

```bash
npx skills add MMS-21/agent-skills -a claude-code   # or codex, opencode, cursor, ...
```

Or copy/symlink this folder into the skills directory your agent reads (for example `~/.agents/skills/dashboard-design-process`). See the repository root [`README.md`](../../README.md) for the full per-agent path table.

## Sources & attribution

- Site: https://dashboarddesignpatterns.github.io/processguidelines.html
- Paper: Bach et al., *Dashboard Design Patterns*, IEEE VIS 2022 / TVCG 2023. https://arxiv.org/abs/2205.00757

Independent distillation for educational/practical use; all credit for the patterns goes to the original authors.

## License

MIT — see the repository `LICENSE`.
