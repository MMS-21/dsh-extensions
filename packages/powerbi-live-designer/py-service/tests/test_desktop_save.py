import ctypes
import sys
import types
import unittest
from unittest.mock import patch
import desktop_save

class Function:
    def __init__(self, work):
        self.work = work
    def __call__(self, *args):
        return self.work(*args)

class Window:
    handle = 999
    def __init__(self):
        self.keys = []
        self.focused = False
    def is_enabled(self):
        return True
    def set_focus(self):
        self.focused = True
    def type_keys(self, value, **kwargs):
        self.keys.append(value)

class SaveTests(unittest.TestCase):
    def invoke(self, windows, foreground=999, owner=123):
        def window_pid(hwnd, pointer):
            ctypes.cast(pointer, ctypes.POINTER(ctypes.c_ulong)).contents.value = owner
        user32 = types.SimpleNamespace(GetForegroundWindow=Function(lambda: foreground),
                                       GetWindowThreadProcessId=Function(window_pid))
        module = types.ModuleType('pywinauto')
        seen = []
        class Desktop:
            def __init__(self, **kwargs):
                pass
            def windows(self, **kwargs):
                seen.append(kwargs)
                return windows
        module.Desktop = Desktop
        with patch.object(desktop_save, 'available', return_value=True), \
             patch.dict(sys.modules, {'pywinauto': module}), \
             patch.object(ctypes, 'windll', types.SimpleNamespace(user32=user32), create=True):
            result = desktop_save.submit_save(123)
        return result, seen

    def test_exact_pid_and_foreground_are_required(self):
        window = Window()
        result, seen = self.invoke([window])
        self.assertEqual(seen[0]['process'], 123)
        self.assertEqual(window.keys, ['^s'])
        self.assertFalse(result['verified'])

    def test_modal_or_ambiguous_windows_never_receive_keys(self):
        window = Window()
        for windows in ([], [window, Window()]):
            with self.assertRaisesRegex(RuntimeError, 'dialog or ambiguous'):
                self.invoke(windows)
        self.assertEqual(window.keys, [])

    def test_changed_foreground_or_pid_never_receives_keys(self):
        for foreground, owner in ((998, 123), (999, 555)):
            window = Window()
            with self.assertRaisesRegex(RuntimeError, 'not foreground'):
                self.invoke([window], foreground, owner)
            self.assertEqual(window.keys, [])

    def test_missing_capability_does_not_fall_back_to_title_matching(self):
        with patch.object(desktop_save, 'available', return_value=False):
            with self.assertRaisesRegex(RuntimeError, 'unavailable'):
                desktop_save.submit_save(123)
