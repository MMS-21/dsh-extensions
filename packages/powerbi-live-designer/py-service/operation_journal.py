"""Append-only operation outcomes; no request bodies, row data, or reasoning."""
import json
import os
import threading
from datetime import datetime, timezone
from uuid import uuid4
from contextvars import ContextVar

_effect = ContextVar('operation_external_effect', default='none-dispatched')
_active = ContextVar('operation_journal_active', default=False)


def mark_external_effect(effect):
    """Preserve the strongest dispatched effect across nested preflight calls."""
    order = {'none-dispatched': 0, 'read-only-dispatched': 1, 'write-dispatched': 2}
    if order[effect] > order[_effect.get()]:
        _effect.set(effect)


class OperationJournal:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()

    def append(self, operation, outcome, operation_id=None, **details):
        entry = {"at": datetime.now(timezone.utc).isoformat(),
                 "operationId": operation_id or uuid4().hex,
                 "operation": operation, "outcome": outcome, **details}
        with self.lock:
            with self.path.open('a', encoding='utf-8') as stream:
                stream.write(json.dumps(entry, ensure_ascii=False) + '\n')
                stream.flush()
                os.fsync(stream.fileno())
        return entry['operationId']

    def run(self, operation, callback):
        operation_id = self.append(operation, 'started')
        token = _effect.set('none-dispatched')
        active_token = _active.set(True)
        try:
            result = callback()
        except Exception as exc:
            # A timeout does not establish whether the external action completed.
            outcome = 'unknown' if isinstance(exc, (TimeoutError,)) else 'failed'
            if getattr(exc, 'blocked', False):
                outcome = 'blocked'
            details = {'errorType':type(exc).__name__, 'externalEffect':_effect.get(),
                       'mutationOutcome':'unknown' if _effect.get() == 'write-dispatched' else 'not-attempted'}
            for attribute, key in [('stage','stage'), ('exit_code','exitCode'),
                                   ('error_count','errorCount'), ('warning_count','warningCount'),
                                   ('diagnostic_codes','diagnosticCodes')]:
                if hasattr(exc, attribute):
                    details[key] = getattr(exc, attribute)
            self.append(operation, outcome, operation_id, **details)
            raise
        finally:
            external_effect = _effect.get()
            _effect.reset(token)
            _active.reset(active_token)
            if _active.get():
                mark_external_effect(external_effect)
        outcome = 'blocked' if isinstance(result, dict) and result.get('ready') is False else 'succeeded'
        summary = {}
        if isinstance(result, dict) and isinstance(result.get('planId'), str):
            summary['planId'] = result['planId']
        if isinstance(result, dict) and isinstance(result.get('plan'), dict):
            plan = result['plan']
            summary = {'planId': result.get('planId'), 'reload': plan.get('reload'),
                       'processingCount': len(plan.get('processing', [])),
                       'blockedCount': len(plan.get('blocked', []))}
            if plan.get('blocked'):
                outcome = 'blocked'
        if isinstance(result, dict) and isinstance(result.get('validation'), dict):
            validation = result['validation']
            summary['validationResult'] = validation.get('result')
            summary['schemaCoverage'] = validation.get('schemaCoverage')
            if validation.get('result') == 'failed':
                outcome = 'blocked'
        self.append(operation, outcome, operation_id, externalEffect=external_effect, **summary)
        return result

    def tail(self, limit=50):
        from collections import deque
        with self.lock:
            if not self.path.exists():
                return []
            with self.path.open(encoding='utf-8') as stream:
                lines = deque(stream, maxlen=min(max(limit, 1), 100))
        entries = []
        for line in lines:
            try:
                entries.append(json.loads(line))
            except ValueError:
                entries.append({'operation': 'journal', 'outcome': 'unknown',
                                'errorType': 'IncompleteJournalEntry'})
        # Started records without a terminal event remain unresolved after crashes.
        return entries
