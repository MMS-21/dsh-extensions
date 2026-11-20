# Dashboard Genres

Six dashboard types (genres) with shared characteristics, pattern combinations, contexts, and goals. Genres are **not an exclusive taxonomy** — they describe common ways patterns combine and support design exploration and discussion about the "right" dashboard for a context.

Two families:

- **Curated dashboards** — highly selective of data and visual representations toward a specific goal; **author-driven storytelling**.
- **Data collection dashboards** — transmit large volumes of information so viewers seek what is relevant to them; **reader-driven storytelling**.

Prevalence is the share of the 144-dashboard corpus coded as that genre (coders disagreed on 22% and resolved it in discussion).

## Curated dashboards

### 1. Static — 21%

Traditional notion: **non-interactive**, **flat/single** structure, **screenfit** display. Concise representations: individual values, derived values, signature charts, trend-arrows, numbers; open layout.

Rare today because dashboards are digital (interaction and drill-down are easy) and display sizes vary (encouraging overflow or multi-page responsiveness).

*Example:* a single-screen KPI board with numbers, arrows and sparklines.

### 2. Magazine — 2%

News/media dashboards inside journalistic articles. Text goes beyond meta information to commentary and storytelling. Often **overflow** on a **single** page with a linear/table-grid layout, visualizations interleaved with narrative. Detailed visualizations and tables. Requires **editorial oversight** as the story changes.

*Example:* The Economist Covid-19 tracker.

### 3. Infographic — 6%

Decorative graphical elements and non-data ink alongside data; annotations, pictograms, gauges, numbers, detailed visualizations; **open** layout; **overflow**. Often static snapshots (monthly/yearly). High design time; tailored annotations make it **less suited to frequently changing data**.

### 4. Embedded Mini — 4%

Small dashboards embedded in other applications (e.g. news sites). Concise visualizations (signature charts, numbers, trend-arrows); **flat** structure; **parameterized**; **navigation** interactions; linked to a deeper magazine/infographic/analytic dashboard.

## Data collection dashboards

### 5. Analytic — 73%

What Few calls a **Faceted Analytic Display**; parallels **Multiple Coordinated Views** (but views need not share data or interaction). Full **detailed visualizations** and **tables**; interactive **exploration**, **navigation**, **personalization**, **filter/focus**; **parameterization**; **tabs/links**; **animated transitions**. **Avoids overflow** — scrolling makes comparison harder.

### 6. Repository — 17%

Many charts across multiple pages; **overflow** and/or **tabs**; extensive **meta information** (source, descriptions, disclaimers, update info); detailed visualizations and numbers; **navigation**; links to explore/filter/download raw data. Acts as a **landing page for large data collections**.

*Examples:* Our World in Data, Public Health Scotland.

## Genre → pattern checklist

| Genre | Characteristic patterns |
|---|---|
| Static | Flat structure, screenfit, signature charts, trend-arrows, numbers, open layout |
| Magazine | Visualizations, annotations, tables, table/grid layout, overflow |
| Infographic | Annotations, pictograms, open layout, overflow |
| Embedded Mini | Flat structure, parameterized, navigation; link to a deeper dashboard |
| Analytic | Detailed visualizations, tables, exploration, navigation, personalization, parameterization, tabs/links, animated transitions; no overflow |
| Repository | Overflow, tabs, data source, data descriptions, disclaimers, update info, visualizations, numbers, navigation |

## Choosing between curated and data collection

- **Curated** fits a single screen (screenfit or overflow), offers limited parameterization, and requires more curation/design/selection. Well-defined use cases; the designer "translates" the data for a purpose.
- **Data collections** use pagination and/or overflow to maximize available information; less need to reduce content; open-ended use cases; broader audiences.
- **Audience signal:** novice/casual users benefit from clear (stratified) layout, titles, little interaction, less information, and message-heavy designs (magazine/infographic). Expert/frequent users benefit from more data, bespoke features, and self-serving designs (analytic/repository).

## Sources

- Site: https://dashboarddesignpatterns.github.io/types.html
- Paper §3 (genres) and §4.2 (curated vs data collections): https://arxiv.org/abs/2205.00757
- Genre examples: `types.html` → per-genre "Example" figures
