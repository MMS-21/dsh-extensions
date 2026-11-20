# Content Design Patterns

**Super-group: Content** — what a dashboard shows. Three groups: **Data Information**, **Meta Information**, **Visual Representations**. (The other super-group, **Composition**, covers how components are arranged: see `composition-patterns.md`.)

Patterns are **not mutually exclusive** and can be combined. Components that purely decorate (illustrative pictures, dividers, borders) are deliberately excluded from this catalog.

Percentages are the share of the 144-dashboard corpus in which the pattern was observed; they do not sum to 100% because patterns combine. Use them to prioritize common solutions over rare ones.

## Data Information

How abstract the shown information is, from raw data to high abstraction.

| Pattern | What it is | Prevalence |
|---|---|---|
| **Detailed datasets** | Raw multi-attribute data (rows, time series, geography); most complete view, little judgement, invites exploration | 94% |
| **Individual values** | A specific data point (e.g. most recent value); implies its importance | 88% |
| **Derived values** | Computed info (trends, KPIs); abstraction over raw data | 69% |
| **Aggregated data** | Many points collapsed into one (sum/mean); implies related values | 67% |
| **Filtered** | A subset by simple rule (e.g. last 14 days) | 42% |
| **Thresholds** | Explicit judgement (good/bad/neutral) via objective cutoffs; one of the highest abstractions | 21% |

**Choosing an abstraction level:** more detail supports comparison and exploration; more abstraction supports at-a-glance reading. Show *information*, not raw data, where the task is lookup or monitoring.

## Meta Information

Context and explanation about the data. Some meta information is implicit (current date implies update time; a known publisher implies the source). **9% of dashboards showed no meta information.**

| Pattern | What it is | Prevalence (explicit / implicit) |
|---|---|---|
| **Update information** | When data was last updated (date/time) | 64% / 73% |
| **Data source** | Where data comes from, collection/analysis method, tools, direct access | 41% / 69% |
| **Data description** | High-level statement of what the dashboard shows | 44% / 57% |
| **Disclaimer** | Assumptions, limitations, missing/misleading-data caveats | 38% |
| **Annotations** | Author-added highlights of specific points/changes | 10% |

**Guideline:** state your meta data. For transparency, provide source and disclaimers; use tooltips or multiple pages when space is constrained.

## Visual Representations

How data information is drawn. Encodings also range from detailed to abstract.

| Pattern | What it is | Prevalence |
|---|---|---|
| **Detailed Charts** | Full axes/ticks/legends/values for precise reading; standalone components | 88% |
| **Numbers** | Prominent single values (absolute, proportion, unit); often large and colored | 62% |
| **Tables** | Raw values in tabular form; key-value lists to multi-column; may embed signature charts, trend-arrows, color heatmaps | 42% |
| **Signature Charts** | Small, axis-less, label-less sparkline-like trends for a quick glance | 21% |
| **Pictograms** | Symbols illustrating concepts; either **pictogram-as-data** (conveys a value/quantity) or **pictogram-as-index** (labels the type of a nearby value) | 19% |
| **Gauges & progress bars** | Range/scale representations (semicircle, bar, thermometer); may mark **critical ranges** (thresholds) | 17% |
| **Trend-arrows** | Small up/down/neutral (or finer-slope) arrows; often red/green; placed beside numbers or inside tables | 13% |
| **Text Lists** | Non-quantitative textual tickers | 9% |

**Guideline:** where space allows, provide **redundant and complementary views** (e.g. a number + trend-arrow + signature chart for the same point; single/derived/threshold values for key data). More abstract encodings can occupy more space to emphasize importance.

## Combining content patterns

- Match the **data abstraction** to the **encoding detail**: detailed datasets → detailed charts/tables; derived/threshold values → numbers/trend-arrows/signature charts.
- Repetition of a compact unit (number + arrow + signature chart) guides the eye and aids retrieval.
- Minimize repetitive data with **abstraction** (emphasize key data) and **parameterization** (support personalization).

## Sources

- Site: https://dashboarddesignpatterns.github.io/patterns.html (`#data-information`, `#meta-information`, `#visual-representations`)
- Paper §2.1: https://arxiv.org/abs/2205.00757
- Examples: `patterns.html` → "Data Information Examples", "Meta Information Examples", "Visual Encoding Examples"
