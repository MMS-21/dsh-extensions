"""Optional Windows Desktop UI Automation fallback.

Save uses Ctrl+S only after finding exactly one matching Power BI Desktop window.
Neither Ctrl+S nor a click proves persistence or data freshness: the caller MUST
verify Desktop status and actual data after automation.

Install only on Windows: py -m pip install pywinauto
"""
from __future__ import annotations
import os


def _desktop_window(project_stem: str):
    if os.name != 'nt':
        raise RuntimeError('Desktop UI automation requires Windows')
    try:
        from pywinauto import Desktop
    except ImportError as exc:
        raise RuntimeError('Install pywinauto to enable Desktop UI automation') from exc
    windows = [w for w in Desktop(backend='uia').windows(visible_only=True)
               if 'Power BI Desktop' in w.window_text() and project_stem.lower() in w.window_text().lower()]
    if len(windows) != 1:
        raise RuntimeError(f'Expected exactly one matching Power BI Desktop window, found {len(windows)}; select it manually')
    return windows[0]


def request_save(project_stem: str) -> dict:
    """Best-effort Save initiation, never an assertion of saved state."""
    from pywinauto.keyboard import send_keys
    window = _desktop_window(project_stem)
    window.set_focus()
    send_keys('^s')
    return {'submitted': True, 'verified': False, 'message': 'Save sent; recheck Desktop status for hasUnsavedChanges=false'}


def require_human_for_refresh(reason: str) -> dict:
    """Avoid fragile ribbon/menu clicks until a version-specific UIA selector is tested."""
    return {'submitted': False, 'verified': False, 'state': 'NEEDS_USER_ACTION', 'message': reason}
