# Design Tradeoffs

Every dashboard design problem has unique parameters (users, tasks, contexts, devices). Tradeoffs are inevitable when no solution is optimal — when the parameters pull against each other. Patterns and genres support the decisions a designer actually has agency over.

## The four parameters

In no particular order:

1. **Screenspace** available for the design.
2. **Number of pages** the information is distributed across (only one page visible at a time).
3. **Abstraction** in the data and information.
4. **Interactivity** required to access information.

Each can be **increased** or **decreased**:

| Parameter | Increase by | Decrease by |
|---|---|---|
| Screenspace | larger screen, or overflow (scroll) | mobile phone, or embedding in an existing UI |
| Pages | distributing content across more pages | combining content into the same page |
| Abstraction | aggregated data, single values, derived values | showing more detail |
| Interactivity | exploration, navigation, filter/focus, personalization | reducing interactive means |

## The goal: minimize all four

- **Minimize screenspace** — easier to embed and show on mobile.
- **Minimize abstraction** — show as much data and information as possible.
- **Minimize pages** — everything visible at a glance.
- **Minimize interaction** — the viewer can do other things while observing; nothing is hidden.

## The stress model

When data/information is too large to minimize all four, you must make tradeoffs. The relationship is best described as **stress**:

- The more you **minimize** each parameter, the more stress you place on the others.
- The more you **maximize** a parameter, the less stress it induces.
- **Minimizing one parameter requires increasing one or more of the others.**

Worked rule:

- To **decrease screenspace**, you must **increase pages**, **or increase interactivity**, **or increase abstraction** (or split the load across several).
- Vice-versa: if you can **increase screenspace** (larger screen), you **can decrease pages**, **or interactivity**, **or abstraction**.
- The same mutual relationships hold among all four parameters.

Schema: https://dashboarddesignpatterns.github.io/tradeoffs.html (figure `tradeoffs2.png`); simplified model in the paper (Fig. 5).

## Why tradeoffs are unavoidable (information-theoretic view)

A dashboard encodes a data space **smaller** than the data it represents. Every encoding loses information, in different ways:

- A large **number** shows the latest value but omits the rest of the series.
- A **detailed chart** loses information through limited height/resolution.
- A **trend-arrow** or **signature chart** is a derived/abridged view.

Information loss can cause confusion, misinterpretation, or erroneous judgement, so it must be **counterbalanced** — by adding interaction (tooltips, scrolling) or spreading content across pages. The cost is **screenspace** (redundant encodings) and **cognitive load** (interpreting multiple abstraction levels of the same data). Good design finds the balance: encode the latest value as a number, use less-precise plots for overviews, and remind viewers of past observations.

## Tradeoffs between genres (curated vs data collections)

- **Curated** dashboards (Static, Magazine, Infographic) minimize screenspace/pages and maximize selectivity; they require careful abstraction to fit.
- **Data collections** (Analytic, Repository) maximize available information via pages/overflow; they reduce abstraction less.
- Choosing between them is itself a tradeoff driven by audience, tasks, and context — see `genres.md`.

## Using this in a design conversation

1. Fix the parameters you have no control over (audience, devices, scenario).
2. For the rest, state the current values (screenspace, pages, abstraction, interactivity).
3. Decide which parameter to minimize (usually screenspace or pages for a focused dashboard).
4. Compensate by increasing one or more of the others, explicitly, and record the reasoning.
5. Re-iterate as the design evolves.

## Sources

- Site: https://dashboarddesignpatterns.github.io/tradeoffs.html
- Site: https://dashboarddesignpatterns.github.io/processguidelines.html (design-tradeoffs figure)
- Paper §4: https://arxiv.org/abs/2205.00757
