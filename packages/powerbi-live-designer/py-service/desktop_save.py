"""Exact-process Save fallback. File identity and persistence are verified by the Node caller.

No title matching, Save As, dialog interaction, or security/authentication handling.
Install the optional pinned dependencies in ../.runtime/python with setup-save.ps1.
"""
import argparse
import importlib.util
import json
import os
import sys
import site
from pathlib import Path

dependency_root = Path(__file__).resolve().parent.parent / '.runtime' / 'python'
if dependency_root.is_dir():
    site.addsitedir(str(dependency_root))
    sys.path.insert(0, str(dependency_root))
_dll_directories = []
if os.name == 'nt':
    for name in ('pywin32_system32', 'win32'):
        directory = dependency_root / name
        if directory.is_dir():
            _dll_directories.append(os.add_dll_directory(str(directory)))

def available():
    if os.name != 'nt' or importlib.util.find_spec('pywinauto') is None:
        return False
    try:
        import pywinauto
        return True
    except (ImportError, OSError):
        return False

def submit_save(pid):
    if not isinstance(pid, int) or pid <= 0 or not available():
        raise RuntimeError('Exact-PID Save is unavailable; run setup-save.ps1 or save manually.')
    from pywinauto import Desktop
    import ctypes
    windows = Desktop(backend='uia').windows(process=pid, visible_only=True, top_level_only=True)
    # Window class varies by release: do not rely on a guessed class. Require the
    # sole visible top-level window and reject owned dialogs or disabled parents.
    if len(windows) != 1 or not windows[0].is_enabled():
        raise RuntimeError('Save stopped: the exact Desktop process has a dialog or ambiguous windows.')
    window = windows[0]
    window.set_focus()
    from ctypes import wintypes
    ctypes.windll.user32.GetForegroundWindow.restype = wintypes.HWND
    ctypes.windll.user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(ctypes.c_ulong)]
    actual_pid = ctypes.c_ulong()
    foreground = ctypes.windll.user32.GetForegroundWindow()
    ctypes.windll.user32.GetWindowThreadProcessId(foreground, ctypes.byref(actual_pid))
    if actual_pid.value != pid or foreground != window.handle:
        raise RuntimeError('Save stopped: the verified Desktop window is not foreground.')
    window.type_keys('^s', set_foreground=False)
    return {'submitted': True, 'verified': False, 'pid': pid}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--pid', type=int)
    args = parser.parse_args()
    print(json.dumps({'available': available()} if args.probe else submit_save(args.pid)))
