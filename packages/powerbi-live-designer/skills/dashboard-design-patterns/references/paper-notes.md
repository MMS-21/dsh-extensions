# Paper Notes: Framework, Methods, Limits, Open Questions

Supplementary material from Bach et al., *Dashboard Design Patterns* (IEEE VIS 2022 / TVCG 2023), https://arxiv.org/abs/2205.00757. Read this when you need the research context, the design framework, or the limits of the patterns.

## Method and corpus

- **144 dashboards**: the 83 collected by Sarikaya et al. (3 discarded for lack of clarity/context) plus 64 new dashboards from news sites and personal applications; 36 were Covid-19-related.
- Three authors built independent coding schemes (constant comparative method); three more coders refined and consolidated them.
- Focus: **structure, visual design, and interactivity** (not the dashboards' intentions).
- Result: **42 design patterns in 8 groups**, split into **content** (data information, meta information, visual representation) and **composition** (page layout, screenspace, structure, interaction, color).
- Interactive versions were coded where available (61%).
- Genres were coded by two independent coders; they disagreed on 32 dashboards (22%) and resolved all disagreements in discussion.

## The design framework (paper §6)

Four parts:

1. **Design knowledge** — guidelines, annotated examples, and design patterns: the "raw material" of a design process. Patterns establish a **terminology** and relate dashboards to neighbouring forms (multiple coordinated views, infographics, data comics) while keeping the boundary deliberately blurred.
2. **Design tradeoffs** — decisions under contradictory requirements; see `tradeoffs.md`.
3. **Design processes** — structure knowledge and decisions into a guided process; see `process-guidelines.md`.
4. **Tool and technical support** — the paper's future-work area: genre/pattern templates, recommender systems, personalization, sharing, bookmarking, annotation, and responsiveness.

## What the patterns are for

- **Ideation, inspiration, and analysis** — descriptive solutions from the wild, not a "good design" prescription.
- A **shared vocabulary** for co-creation and kick-off meetings: "limit down the design complexity from endless design options to 2-3 good candidates".
- A **checklist** to review design decisions.
- A basis for **structured evaluation** of dashboards (a gap the paper calls out).

## Limitations (paper §6.5)

- The corpus is a **sample**, not exhaustive; patterns and frequencies are representative of the analyzed dashboards only.
- Pattern collections are **qualitative**; hybrids are expected (parallel inside hierarchical; grouped + stratified + open layouts).
- The paper does **not** determine what makes a "good" dashboard; that depends on subjective, domain-specific factors.
- Guidelines can be generic, limited to specific use cases, and sometimes contradictory.

## Open questions (paper §6.2)

- To what extent do users engage with interactive dashboards?
- Does interaction help users solve tasks effectively and efficiently, or does it just add complexity?
- How much data information is too much? How to support specific tasks and audiences?

## Accessibility and responsiveness

- Accessibility was a frequent workshop topic and is **often neglected** (titles, colors, chart sizes). The authors note there are **no accessibility guidelines that account for dashboard density, tasks, and scenarios**.
- **Responsiveness** is an open problem: a handful of studies exist for visualization, but dashboard responsiveness should include **levels of abstraction** for data and encodings — potentially turning a static dashboard into an analytic one for smaller screens.
- Treat accessibility as a first-class review criterion even though the source does not formalize it (see `dashboard-design-review`).

## Assets and links

- Paper PDF: https://arxiv.org/pdf/2205.00757.pdf
- VIS 2022 presentation: https://github.com/dashboarddesignpatterns/dashboarddesignpatterns.github.io/files/9822937/Dashboard.Design.Patterns.VIS.2022.live.talk.pdf
- Coding sheet: https://docs.google.com/spreadsheets/d/1wAHzX6QDgVQ9EsAVkyDuSmFL6LnErg9uBeJMbJcjC4k/edit
- Dashboard collection: https://drive.google.com/drive/folders/1X9QhXElytlTrtRACUZd0_292je72l4MS
- Cheatsheet (compact): https://github.com/dashboarddesignpatterns/dashboarddesignpatterns.github.io/raw/main/docs/assets/Cheatsheet-compact.png
- Cheatsheet (vertical/slim): https://github.com/dashboarddesignpatterns/dashboarddesignpatterns.github.io/raw/main/docs/assets/Cheatsheet-vertical.png
- Workshop outline: https://dashboarddesignpatterns.github.io/workshopoutline.html
- Team: Benjamin Bach (Edinburgh, main contact), Euan Freeman (Glasgow), Alfie Abdul-Rahman (King's College London), Cagatay Turkay (Warwick), Saiful Khan, Yulei Fan, Min Chen (Oxford).
