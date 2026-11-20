"""Read local semantic metadata only; never execute DAX, M, or model operations."""
import hashlib
import json
import re
from pathlib import Path

MAX_FILE_BYTES = 2_000_000
MAX_TOTAL_BYTES = 16_000_000
MAX_FILES = 1000


def report_directory(project):
    """Resolve the single report beside a PBIP without following escaping paths."""
    project = project.resolve()
    if project.is_dir() and project.name.endswith('.Report'):
        return project
    if project.suffix.lower() != '.pbip':
        raise ValueError('Use a PBIP project or .Report folder; PBIX requires a separate PBIP copy')
    if project.stat().st_size > MAX_FILE_BYTES:
        raise ValueError('PBIP descriptor exceeds the file budget')
    body = json.loads(project.read_text(encoding='utf-8-sig'))
    reports = [a['report']['path'] for a in body.get('artifacts', [])
               if isinstance(a, dict) and isinstance(a.get('report'), dict)
               and isinstance(a['report'].get('path'), str)]
    if len(reports) != 1:
        raise ValueError('Expected one report reference in the PBIP project')
    report = (project.parent / reports[0]).resolve()
    if not report.is_relative_to(project.parent) or not report.name.endswith('.Report'):
        raise ValueError('Report reference escapes the project directory or is not a .Report folder')
    return report


def inspect_semantic_model(project):
    project = project.resolve()
    root = project.parent
    consumed = 0
    sources = []

    def contained(path):
        path = path.resolve()
        if not path.is_relative_to(root):
            raise ValueError('Semantic reference escapes the project directory')
        return path

    def read(path):
        nonlocal consumed
        path = contained(path)
        if len(sources) >= MAX_FILES or path.stat().st_size > MAX_FILE_BYTES:
            raise ValueError('Semantic inspection file budget exceeded')
        data = path.read_bytes()
        consumed += len(data)
        if consumed > MAX_TOTAL_BYTES or len(data) > MAX_FILE_BYTES:
            raise ValueError('Semantic inspection byte budget exceeded')
        sources.append({'path': str(path.relative_to(root)),
                        'sha256': hashlib.sha256(data).hexdigest()})
        return data.decode('utf-8-sig')

    if project.is_file():
        descriptor = json.loads(read(project))
        reports = [a['report']['path'] for a in descriptor.get('artifacts', [])
                   if isinstance(a, dict) and isinstance(a.get('report'), dict)
                   and isinstance(a['report'].get('path'), str)]
        if len(reports) != 1:
            raise ValueError('Expected one report reference in the PBIP project')
        report = contained(root / reports[0])
    else:
        report = project
    definition = json.loads(read(report / 'definition.pbir'))
    reference = definition.get('datasetReference', {}).get('byPath', {}).get('path')
    if not isinstance(reference, str) or not reference:
        raise ValueError('No local semantic model reference; remote models are not inspected')
    model = contained(report / reference)
    tables, relationships = [], []
    warnings = []
    if (model / 'model.bim').is_file():
        body = json.loads(read(model / 'model.bim')).get('model', {})
        for table in body.get('tables', []):
            tables.append({'name': table.get('name'),
                           'columns': [{'name': c.get('name'), 'dataType': c.get('dataType')}
                                       for c in table.get('columns', [])],
                           'measures': [{'name': m.get('name'), 'formatString': m.get('formatString')}
                                        for m in table.get('measures', [])]})
        for rel in body.get('relationships', []):
            relationships.append({k: rel[k] for k in ('name', 'fromTable', 'fromColumn', 'toTable', 'toColumn', 'isActive', 'crossFilteringBehavior') if k in rel})
        format_name = 'bim'
    else:
        files = sorted((model / 'definition').rglob('*.tmdl'))
        if not files:
            raise ValueError('No supported local TMDL or model.bim definition found')
        if len(files) > MAX_FILES:
            raise ValueError('Semantic inspection file budget exceeded')
        # Deliberately a metadata inventory, not a full TMDL semantic parser.
        name_pattern = r"(?:'((?:[^']|'')*)'|([^=\r\n]+?))\s*(?:=|$)"
        for path in files:
            text = read(path)
            table_name = re.search(r'^table\s+' + name_pattern, text, re.M)
            if table_name:
                table = {'name': (table_name.group(1) or table_name.group(2)).strip().replace("''", "'"), 'columns': [], 'measures': []}
                for kind, first, second in re.findall(r'^\s+(column|measure)\s+' + name_pattern, text, re.M):
                    table['columns' if kind == 'column' else 'measures'].append({'name': (first or second).strip().replace("''", "'")})
                tables.append(table)
            for block in re.split(r'(?m)(?=^relationship\s)', text):
                match = re.match(r'^relationship\s+([^\r\n]+)', block)
                if match:
                    rel = {'name': match.group(1).strip()}
                    for key in ('fromColumn', 'toColumn', 'isActive', 'crossFilteringBehavior'):
                        field = re.search(r'^\s+' + key + r':\s*([^\r\n]+)', block, re.M)
                        if field:
                            rel[key] = field.group(1).strip()
                    relationships.append(rel)
        format_name = 'tmdl'
        warnings.append('Partial TMDL inventory: names and relationship endpoints only; types, hierarchies, expressions and full semantics are not validated.')
    if not tables:
        warnings.append('No tables or measures found in the inspected disk definitions; this may be an empty model, not an analysis-ready dataset.')
    return {'readOnly': True, 'source': 'local-files', 'format': format_name,
            'project': str(project), 'tables': tables, 'relationships': relationships,
            'sources': sources, 'warnings': warnings,
            'limitations': ['Disk metadata may differ from unsaved Desktop state.',
                            'Business meanings and ontology suggestions require user review.',
                            'No rows, queries, connection strings or model expressions are returned.']}
