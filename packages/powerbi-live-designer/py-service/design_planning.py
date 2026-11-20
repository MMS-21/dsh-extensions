"""Bounded design proposals and review findings; never edits report definitions."""
import json
import os
import re
from uuid import uuid4


def text(value, label, limit=2000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f'{label} must be nonempty text up to {limit} characters')
    return value.strip()


def strings(value, label):
    if not isinstance(value, list) or len(value) > 100:
        raise ValueError(f'{label} must be a list of at most 100 strings')
    return [text(item, label) for item in value]


def save_plan(runtime, project, brief):
    allowed = {'audience', 'questions', 'metrics', 'pages', 'assumptions'}
    if not isinstance(brief, dict) or set(brief) - allowed:
        raise ValueError('Design brief accepts audience, questions, metrics, pages and assumptions only')
    clean = {'audience': text(brief.get('audience'), 'audience')}
    for key in ('questions', 'metrics', 'assumptions'):
        clean[key] = strings(brief.get(key, []), key)
    if not clean['questions']:
        raise ValueError('At least one business question is required')
    pages = brief.get('pages')
    if not isinstance(pages, list) or not 1 <= len(pages) <= 20:
        raise ValueError('Provide 1–20 proposed pages')
    clean['pages'] = []
    for page in pages:
        if not isinstance(page, dict) or set(page) != {'title', 'visuals'}:
            raise ValueError('Each page requires title and visuals only')
        visuals = page['visuals']
        if not isinstance(visuals, list) or not 1 <= len(visuals) <= 30:
            raise ValueError('Each page needs 1–30 proposed visuals')
        normalized = []
        for visual in visuals:
            if not isinstance(visual, dict) or set(visual) != {'question', 'measure', 'dimension', 'acceptance'}:
                raise ValueError('Each visual requires question, measure, dimension and acceptance')
            normalized.append({key: text(value, key) for key, value in visual.items()})
        clean['pages'].append({'title': text(page['title'], 'title'), 'visuals': normalized})
    plan_id = uuid4().hex
    payload = {'planId': plan_id, 'project': str(project), 'status': 'proposed',
               'verification': 'structure-only; model bindings and business meaning require review', 'brief': clean}
    data = json.dumps(payload, ensure_ascii=False)
    if len(data.encode('utf-8')) > 60000:
        raise ValueError('Design proposal exceeds 60 KB')
    target = runtime / f'design-{plan_id}.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(data + '\n', encoding='utf-8')
    os.replace(temporary, target)
    return {'ok': True, **payload, 'path': str(target), 'reportChanged': False}


def record_review(runtime, project, journal, review):
    allowed = {'planId', 'source', 'expected', 'observed', 'evidence', 'severity', 'nextAction'}
    if not isinstance(review, dict) or set(review) != allowed:
        raise ValueError('Review requires planId, source, expected, observed, evidence, severity and nextAction')
    plan_id = review['planId']
    if not isinstance(plan_id, str) or not re.fullmatch(r'[a-f0-9]{32}', plan_id):
        raise ValueError('Invalid design plan id')
    plan = json.loads((runtime / f'design-{plan_id}.json').read_text(encoding='utf-8'))
    if plan['project'] != str(project):
        raise ValueError('Review project mismatch')
    if review['source'] not in ('user-feedback', 'agent-finding'):
        raise ValueError('Review source must distinguish user feedback and agent findings')
    if review['severity'] not in ('info', 'improvement', 'blocker'):
        raise ValueError('Invalid review severity')
    clean = {key: text(review[key], key) for key in ('expected', 'observed', 'nextAction')}
    clean['evidence'] = strings(review['evidence'], 'evidence')
    journal.append('design-review', 'recorded', planId=plan_id, source=review['source'],
                   severity=review['severity'], finding=clean)
    return {'ok': True, 'planId': plan_id, 'recorded': True, 'executionApproved': False,
            'journalPath': str(journal.path)}
