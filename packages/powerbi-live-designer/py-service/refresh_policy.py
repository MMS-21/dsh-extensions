"""Deterministic smart-refresh planner for Desktop PBIP projects.

This module plans actions. It NEVER processes a model or trusts an LLM guess
about table lineage as proof of a safe target. The executor must independently
check available capabilities and Desktop state before any mutation.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass, field

VALID_KINDS = {
    'pbir', 'measure', 'relationship', 'calculated', 'tmdl',
    'import_schema', 'm_expression', 'import_partition', 'source_data',
    'directquery', 'unknown',
}
MODEL_KINDS = {'measure', 'relationship', 'calculated', 'tmdl'}
IMPORT_KINDS = {'import_schema', 'm_expression', 'import_partition', 'source_data'}


@dataclass
class Plan:
    reload: str = 'none'
    processing: list[dict] = field(default_factory=list)
    dax_queries: list[str] = field(default_factory=list)
    screenshot_pages: list[str] = field(default_factory=list)
    blocked: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    mode: str = 'smart'
    scope: str = 'affected'
    verify_dax: bool = True
    verify_screenshots: bool = True

    @property
    def executable(self) -> bool:
        return not self.blocked

    def to_dict(self) -> dict:
        return {**asdict(self), 'executable': self.executable}


def build_plan(manifest: dict) -> Plan:
    """Manifest must be a reviewed change manifest, not a guess from filenames.

    Example: {"changes":[{"kind":"source_data","tables":["Sales"],
               "storage":"Import", "lineageVerified":true}],
              "daxQueries":["EVALUATE ROW(\"Rows\", COUNTROWS('Sales'))"],
              "screenshotPages":[], "refreshPolicy":"smart",
              "refreshScope":"affected", "verifyDax":true,
              "verifyScreenshots":true}
    """
    if not isinstance(manifest, dict):
        raise ValueError('Refresh manifest must be an object')
    if manifest.get('refreshPolicy', 'smart') != 'smart':
        raise ValueError('This version supports only smart refresh')
    if manifest.get('refreshScope', 'affected') != 'affected':
        raise ValueError('This version supports only affected-table scope')
    p = Plan()
    p.verify_dax = manifest.get('verifyDax', True) is True
    p.verify_screenshots = manifest.get('verifyScreenshots', True) is True
    if not p.verify_dax or not p.verify_screenshots:
        p.blocked.append('Both DAX and screenshot verification are required by policy')
    changes = manifest.get('changes')
    if not isinstance(changes, list) or not changes:
        p.blocked.append('Provide at least one explicit change declaration')
        return p
    if len(changes) > 100:
        raise ValueError('Too many changes in one operation')
    calculate = False
    full_tables: set[str] = set()
    has_file_model_edit = False
    has_report_edit = False
    for i, change in enumerate(changes):
        if not isinstance(change, dict):
            p.blocked.append(f'Change {i} is not an object')
            continue
        kind = change.get('kind')
        if kind not in VALID_KINDS or kind == 'unknown':
            p.blocked.append(f'Change {i}: unsupported or unknown kind {kind!r}')
            continue
        if kind == 'pbir':
            has_report_edit = True
        if kind in MODEL_KINDS:
            calculate = True
            if change.get('fileEdit', True) is True:
                has_file_model_edit = True
        if kind in IMPORT_KINDS:
            if kind != 'source_data':
                has_file_model_edit = True
            tables = change.get('tables', [])
            if not isinstance(tables, list) or not tables or any(
                not isinstance(t, str) or not t.strip() or len(t) > 128 for t in tables
            ):
                p.blocked.append(f'Change {i}: affected table names required')
                continue
            if change.get('storage') != 'Import':
                p.blocked.append(f'Change {i}: target is not verified Import storage')
                continue
            if change.get('lineageVerified') is not True:
                p.blocked.append(f'Change {i}: affected-table lineage not verified')
                continue
            full_tables.update(t.strip() for t in tables)
        if kind == 'directquery':
            p.warnings.append('DirectQuery requires visual requery, not Import Full processing')
        if kind == 'source_data' and change.get('fileEdit', False):
            p.blocked.append(f'Change {i}: source_data refresh cannot also claim file edits')
    if has_file_model_edit and manifest.get('tmdlValidated') is not True:
        p.blocked.append('Model files changed but TMDL semantic validation has not been confirmed')
    p.reload = 'model' if has_file_model_edit else ('report' if has_report_edit else 'none')
    if calculate:
        p.processing.append({'type': 'Calculate', 'target': 'model'})
    for table in sorted(full_tables):
        p.processing.append({'type': 'Full', 'target': 'table', 'table': table})
    queries = manifest.get('daxQueries', [])
    pages = manifest.get('screenshotPages', [])
    if not isinstance(queries, list) or any(not isinstance(q, str) or len(q) > 5000 for q in queries):
        raise ValueError('Invalid DAX queries')
    if not isinstance(pages, list) or any(not isinstance(pg, str) or len(pg) > 100 for pg in pages):
        raise ValueError('Invalid screenshot pages')
    p.dax_queries = queries[:25]
    p.screenshot_pages = pages[:50]
    if p.verify_dax and not p.dax_queries:
        p.blocked.append('No DAX verification queries supplied; add tested assertions')
    if p.verify_screenshots and not p.screenshot_pages:
        p.warnings.append('No page list supplied: capture the current Desktop page only')
    if len(full_tables) > 20:
        p.warnings.append('Large number of affected tables; verify lineage and cost before running')
    if p.reload == 'model':
        p.warnings.append('Model reload may invalidate previous live edits; run unsaved-state preflight')
    if p.processing:
        p.warnings.append('Model processing is provider-dependent and may be unsupported on Desktop; do not auto-escalate to full refresh')
    return p
