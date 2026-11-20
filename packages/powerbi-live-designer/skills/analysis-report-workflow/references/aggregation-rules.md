# Measure and filter review

Read before defining measures, acceptance checks, or analytical bindings. A field name or successful query is not a complete metric definition.

- State the row grain, entity population, time grain, units, inclusion/exclusion rules, and source. Separate facts from proposed ontology mappings.
- Define entity aggregation and time aggregation separately. Annual flows may be summed over disjoint periods for a clearly labeled period total. Stocks, snapshots, precomputed cumulative series, ratios and shares need different rules; cumulative values are never summed over time.
- Use mutually exclusive members for totals. Authoritative World/region rows are alternatives to constituent rows, not extra observations to add. Compare overlapping groups separately, with explicit labels, and never rank aggregates as countries under a country-only label.
- A rate needs compatible numerator/denominator coverage and units. For groups, recompute from matched underlying totals with valid weights; never sum or blindly average precomputed rates. Preserve supplied entity-period rates for exact lookup, and label separately any derived group rate.
- A global share uses the matching global denominator for the same year, definition and units; an entity filter must not silently turn it into a share of selection. Define filter behavior and multi-year behavior explicitly. If a card requires one year, enforce one year or show an explanatory empty state.
- YoY requires the same entity/scope in consecutive years; CAGR requires positive valid endpoints and the stated elapsed years. Index series require a nonzero baseline. Missing or zero denominators produce a labeled unavailable result, not zero or infinity.
- Coverage uses the relevant year, population and field. All-history row coverage is not current-year coverage. Distinguish missing rows, missing values and measured zero. Do not invent missing mappings or treat unmatched populations as complete.
- Recompute consequential claims from the actual selected input. Attach source, method and tolerances to acceptance checks. Descriptive trends or arithmetic contributions do not establish causation.

Completion: every proposed metric specifies entity/time aggregation, numerator/denominator where applicable, units, filter behavior, missing-data behavior and an observable check. If those remain unresolved, keep the metric proposed/unverified and ask only the consequential question.
