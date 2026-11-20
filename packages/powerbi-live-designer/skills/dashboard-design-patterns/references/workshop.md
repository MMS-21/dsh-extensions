# Dashboard Design Workshop

Material from the two-week online workshop (March 2022, 23 participants) that accompanied the research. Use this when running or teaching a dashboard design session, or when you want the empirical lessons learned.

## Goals

**It helps you:**

- Learn dashboard design guidelines.
- Design your own dashboards as visual mockups and sketches.
- Understand design decisions and tradeoffs.
- Make deliberate design decisions and reflect on them.
- Use state-of-the-art mockup tools (Figma, Miro).
- Discuss designs with peers and learn from others.

**It does not provide:**

- An introduction to Tableau, Power BI, or similar tools.
- A workshop on programming visualizations (d3.js and others).
- A certificate in dashboard design.

## Prerequisites

- A data/topic you want to design a dashboard for (public data, research data, personal data).
- Context: who it is for, how it supports people, where people see and interact with it.
- Time: at least 2 hours beyond the check-in sessions.

## Format

- **Two weeks**, three stages: a 3-hour kickoff, six asynchronous 1-hour check-in sessions, and a debrief.
- Kickoff: example dashboards → design challenges and high-level guidelines → the tradeoff framework → a possible design process, one stage per pattern group:
  1. Data Information (what to show)
  2. Dashboard structure (pages and their relations)
  3. Page design (page fit, layout, visual representation)
  4. Interactivity
  5. Color
- Held on Zoom; participants worked asynchronously in Figma and shared mockups.

## Activities

1. **Dashboard genres** — show examples; discuss likes/dislikes and possible audiences.
2. **General guidelines + tradeoffs** — introduce the high-level guidelines and the design-tradeoff framework.
3. **Design thinking** — introduce the double diamond.
4. **Worksheet 1 — Data, Use & Genres (15 min):** list/describe data facets; audience knowledge; tasks/decisions/workflow context; device context; pick 1-3 genres; report.
5. **Worksheet 2 — Structure (10 min):** single vs multiple pages; group information; pick one page to continue with.
6. **Worksheet 3 — Data & Representation (15 min):** abstraction level; visualization choices.
7. **Worksheet 4 — Layout (10 min):** pick a layout; experiment with post-its.
8. **Worksheet 5 — Screenspace & Interactivity (10 min):** handle overflow; what interaction is needed and how the UI supports it.
9. **Worksheet 6 — Final Mockup (15 min):** detailed mockup; two versions if undecided.

Instructor outline: https://dashboarddesignpatterns.github.io/workshopoutline.html

## Findings from the workshop

- **Information overload** was the most frequent topic: too much info, confusion about where to look, unclear relations between components ("not sure how the line chart relates to the number"), and overused color with unclear function.
- **Screenspace and page count**: participants converged on the idea that many techniques compress dashboards (screenfit, overflow, detail-on-demand, parameterization, multiple pages, miniature charts, single values). A single pattern (e.g. multiple pages) or a gradual combination can turn a large desktop dashboard into a mobile one.
- **Audience matters:** novice/casual users need clear (stratified) layout, titles, little interaction, less information, and message-heavy designs (magazine/infographic). Expert/frequent users need more data, more bespoke features, and self-serving designs (analytic/repository).
- **Context is often missing:** individual values and numbers need comparison context (temporal, or other comparisons such as miniature charts, trend arrows, detailed data). Experts may have it implicitly; novices may not.
- **Color and accessibility:** color consistency was a big issue; advice converged on removing color where unnecessary (especially on screenfit dashboards). Accessibility (titles, colors, chart sizes) is often neglected, and no dashboard-specific accessibility guidelines existed.
- **Tools:** prototyping was easy, but no tool supported all design patterns well (optimal screenspace use, layout, interactions, shared color scheme).

## Participant reflections (quotes)

- "Start with simple designs that spotlight just the most important data, then add to this as you go; this will help avoid just putting everything you can on the dashboard, keeping it focused. (This might not apply to repository style dashboards.)" — P4
- "I learned not to try to ask too many questions for one graph. One graph can give several different answers, but the question should just be one question." — P3
- "Simpler is often better when it comes to charts: bar charts, line charts, and tables are often clearer and easier to read than their more fancy looking counterparts." — P4
- "If you try to simplify [your design] too much, you risk imposing your own story." — P3
- "Use filters, menus, buttons, and parameters to reduce the number of static visuals shown at any one time [to] keep things readable." — P4
- "[Design patterns and their terminology] limit down [the design complexity] from endless design options to 2-3 good candidates […] I think it will be really useful for co-creation or kick-off meetings […] so everyone is very clear on what the key elements are and what we're trying to achieve right from the start." — P1
- "[I used the patterns] first as guidance for designing [then] I did any changes with the design principles in mind. In the end, I used [the patterns] as a 'check-list' to review my design decisions." — P5

## Materials

- Workshop slides: https://github.com/dashboarddesignpatterns/dashboarddesignpatterns.github.io/files/10031871/Dashboard.Design.Workshop.2022.pdf
- Worksheets: https://github.com/dashboarddesignpatterns/dashboarddesignpatterns.github.io/files/10031855/Dashboard.Workshop.Worksheets.1.pdf
- Cheatsheets (all patterns): https://github.com/dashboarddesignpatterns/dashboarddesignpatterns.github.io/files/10031879/Dashboard.Workshop.Cheatsheets.2.pdf
- Workshop page: https://dashboarddesignpatterns.github.io/workshop.html
- Instructor outline: https://dashboarddesignpatterns.github.io/workshopoutline.html

## Sources

- Paper §5: https://arxiv.org/abs/2205.00757
- Site: https://dashboarddesignpatterns.github.io/workshop.html and `workshopoutline.html`
