# Design Process and Guidelines

## High-level guidelines

Numbered for convenience; **not ordered by priority**. Some guidelines are generic, some contradict each other, and most are limited to specific use cases.

01. Don't overwhelm viewers
02. Avoid visual clutter
03. Avoid poor visual design
04. Carefully choose KPIs
05. Align with existing workflows
06. Don't add too much data
07. Provide consistency
08. Provide interaction affordances
09. Manage complexity
10. Organize charts symmetrically
11. Group charts by attribute
12. Order charts by time
13. Balance data + space
14. Increase information
15. Avoid redundancy of information
16. Show information, rather than data
17. Design is an iterative process
18. Context is very important
19. State your meta data
20. Use color carefully

## Guidelines involving design patterns

1. **Consider design tradeoffs** (see `tradeoffs.md`).
2. Where space allows, provide **redundant and complementary views** (visual representations) and **levels of abstraction** (data information):
   - show selected **numbers** alongside **trend-arrows** and **signature charts**;
   - more abstract encodings can occupy more screenspace to emphasize importance/relevance;
   - use **single values**, **derived values**, and **thresholds** to show key data points at a glance.
3. For transparency, provide **meta information**: state the **data source**, give **disclaimers** about processing; use **tooltips** or **multiple pages** if space is constrained.
4. Avoid **overflow** structure in **analytic dashboards** to facilitate comparison; use **screenfit** or **multiple pages**.
5. Minimize repetitive data using **abstraction** (emphasize key data) and **parameterization** (support personalization).
6. Pick the **genre** best suited to the audience and their informational needs, and use its characteristic patterns as a checklist.
7. Ensure a **consistent color scheme** across the whole dashboard — reuse colors for the same data/value, or a dedicated, clearly distinguishable scheme per visualization.
8. Choose a **layout** that expresses relations between widgets: **schematic**, **grouped** by type or task, **table**, or **stratified** (important information on top).

## Process outline (Stage 0-6)

Stages are a guide, not strict instructions. The process is **iterative**: re-make decisions, explore alternatives, critically evaluate current solutions. It assumes requirement analysis has defined users, tasks, and datasets.

Design-thinking note: the workshop introduces the **double diamond** (discover → define → develop → deliver) as the framing for this iterative process — diverge to explore options, converge to decide, then repeat.

### Stage 0: Clarify the context

- **Audience** — what do they know about the data and about visualization? Think of real people (personas).
- **Setting** — computer screen, mobile, website, wall display? Can they interact? How much time do they have? How frequently do they consult it?
- **Tasks and decisions** — what decisions do they make with the data? What information do they need? Lookup, compare, or analyze?
- **Information needed** — all of the data, or only what is most relevant?

### Stage 1: Data & Information

Clarify which information from the dataset matters for the task (Stage 0). Use **Data Information** patterns and decide the abstraction level (more data vs less). See `content-patterns.md`.

### Stage 2: Structure

Single page or multiple? If multiple, define page relationships and what goes together (do not fear duplicating information). Meaningful structure aids navigation and consistency. See `composition-patterns.md` → Page Structure.

### Stage 3: Visual Representations

Find encodings for each page. Match data abstraction to encoding detail. Guidelines: redundant/complementary views where space allows; minimize repetitive data via abstraction + parameterization; consistent color scheme. See `content-patterns.md`.

### Stage 4: Page Layout

Organize components into a meaningful structure reflecting relations and importance (e.g. parallel/table for similar information). See `composition-patterns.md` → Page Layout.

### Stage 5: Screenspace

Fit everything on one screen, or interactively reveal off-screen data. Guideline: **avoid overflow in analytic dashboards** (use screenfit or multiple pages). See `composition-patterns.md` → Screenspace.

### Stage 6: Interactivity

Support exploration, filter & focus, navigation, personalization. **Minimize interaction**: if you can solve something with minimal or no interaction, do that.

## Sources

- Site: https://dashboarddesignpatterns.github.io/processguidelines.html
- Paper §1.2 (guidelines), §5.1 (process), §6.3 (design processes): https://arxiv.org/abs/2205.00757
