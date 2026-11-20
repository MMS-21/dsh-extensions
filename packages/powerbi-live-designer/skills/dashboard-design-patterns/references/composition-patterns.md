# Composition Design Patterns

**Super-group: Composition** — how content components are combined and presented. Five groups: **Screenspace**, **Page Structure**, **Page Layout**, **Interactions**, **Color**. (The other super-group, **Content**, covers what is shown: see `content-patterns.md`.)

A **widget** is the smallest unit on screen — usually one or a combination of visual representations, a title, and possible meta information.

Patterns are **not mutually exclusive** and are commonly combined (e.g. a stratified layout combined with an open layout; a screenfit page using detail-on-demand). Percentages are from the 144-dashboard corpus.

## Screenspace

Strategies to fit content onto one screen. "Page" means a single composite view; only one page is visible at a time.

| Pattern | What it is | Prevalence |
|---|---|---|
| **Parameterized** | User controls what is shown (sliders, checkboxes, drop-downs, date pickers, search) | 52% |
| **Detail-on-demand** | Extra content revealed on request (tooltips, pop-ups, drill-down) | 47% |
| **Screenfit** | All content of a page fits the screen; no scrolling or tooltips needed | 44% |
| **Multiple pages** | Content split across pages, navigated via tabs/buttons/links | 42% |
| **Overflow** | Page larger than the screen; revealed by scrolling | 22% |

**Guideline:** avoid **overflow** in **analytic** dashboards — scrolling makes comparison harder. Use screenfit or multiple pages instead.

**Combination:** detail-on-demand and parameterization both hide data and reveal it through interaction; they can make a screenfit dashboard more economical.

## Page Structure

Relationships across multiple pages.

| Pattern | What it is | Prevalence |
|---|---|---|
| **Single Page** | All information on one page (screenfit or overflow) | 61% |
| **Hierarchical** | Pages in levels; drill down from abstract to detailed | 19% |
| **Parallel** | Pages at the same level, no hierarchy; unconstrained tab/link navigation; visual consistency; often repeated layout/data/encodings | 16% |
| **Open** | Multiple pages with loose relationships | 8% |
| **Semantic** | Pages follow a real-world structure (e.g. organizational divisions) | (not separately reported) |

**Guideline:** a meaningful structure helps navigation and consistency. A parallel structure implies repeated layout and encodings; a hierarchical structure implies increasing detail as you drill down. Do not fear duplicating information across pages.

## Page Layout

How widgets are arranged and implicitly grouped on one page.

| Pattern | What it is | Prevalence |
|---|---|---|
| **Stratified** | Top-down ordering; high-level/important information on top, detail below | 49% |
| **Grouped** | Explicit grouping of related widgets (dividers, whitespace, shaded regions, shared title) | 33% |
| **Open** | Varied sizes/aspect ratios on a grid; no strong position semantics; equal importance; invites reordering | 22% |
| **Table** | Widgets aligned into semantic rows/columns; repetition of encodings; supports comparison and juxtaposition | 19% |
| **Schematic** | Widgets placed by an external property (map/geography, network, process) | 1% |

**Guideline:** choose a layout that expresses relations between widgets — schema, grouping by type/task, table, or stratified (important information on top). Combinations are common (stratified + open; stratified + grouped).

## Interactions

Four roles interaction plays. Only **4% of dashboards had no interaction**.

| Pattern | What it is | Prevalence |
|---|---|---|
| **Exploration** | Explore data and relations: brushing + linking (18%), detail-on-demand (71%), pan/zoom, focus+context | 89% |
| **Navigation** | Move through pages/views: tabs, links, navigation buttons, scrolling, animated transitions; constrained (sequence) or unconstrained (free) | 76% |
| **Filter and Focus** (paper: *Drilldown*) | Find/focus specific data: search fields, drop-downs, radio buttons, checkboxes, range sliders | 55% |
| **Personalization** | Redefine/reconfigure what is shown: add/remove/resize/reorder representations | 23% |

**Guideline:** minimize interaction — if a problem can be solved with little or no interaction, do that. Interaction can also pace a narrative (magazine/infographic) by revealing information progressively.

## Color

Dashboard-level use of color (not per-chart color design).

| Pattern | What it is | Prevalence |
|---|---|---|
| **Data Encoding** | Color encodes categories or scales in the data (e.g. choropleth) | 80% |
| **Shared / Distinct** | A shared palette across the dashboard (branding/consistency), or unique recognizable colors per group/facet | ~35% |
| **Semantic** | Color carries meaning (traffic-light status, red/green sentiment); often with gauges and thresholds | 26% |
| **Emotive** | Aesthetic/emotional impact; common in infographic-style dashboards | 6% |

> Note: the paper labels the ~35% figure "shared"; the site splits the idea into **Distinct** (unique colors per widget/data type) and **Shared** (one palette across the dashboard). Prevalence for the two is not separated in the paper.

**Guideline:** use color carefully; keep a consistent scheme across the whole dashboard (reuse colors for the same data/value, or a dedicated distinguishable scheme per visualization). Remove color where it is not necessary, especially on screenfit dashboards.

## Sources

- Site: https://dashboarddesignpatterns.github.io/patterns.html (`#screenspace`, `#structure`, `#page-layout`, `#interactions`, `#color`)
- Paper §2.2: https://arxiv.org/abs/2205.00757
- Examples: `patterns.html` → "Layout Examples", "Color Examples", "Interaction Examples"
- Tradeoff schema: https://dashboarddesignpatterns.github.io/tradeoffs.html
