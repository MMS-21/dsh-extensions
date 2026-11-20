import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Designer

PNG_1PX = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/F8sAAAAASUVORK5CYII='
)


class DesignerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        project = root / 'Sample.pbip'
        project.write_text('{"artifacts":[{"report":{"path":"Example.Report"}}]}', encoding='utf-8')
        self.d = Designer(project, 'fake-cli', root / 'runtime', allow_model_writes=True)

    def tearDown(self):
        self.temp.cleanup()

    def test_capture_creates_image_without_status_or_reload(self):
        calls = []
        def fake(arguments, timeout=120):
            calls.append(arguments)
            Path(arguments[arguments.index('--screenshot') + 1]).write_bytes(PNG_1PX)
            return 0, {'ok': True}, '{"ok":true}'
        self.d.run = fake
        result = self.d.action('capture', {'page': 'ReportSectionabc123'})
        self.assertTrue(result['ok'])
        self.assertEqual(result['state']['captureVersion'], 1)
        self.assertEqual(len(calls), 1)
        self.assertIn('--screenshot', calls[0])
        self.assertNotIn('--reload', calls[0])

    def test_capture_wrong_page_is_rejected_and_image_removed(self):
        def fake(arguments,timeout=120):
            Path(arguments[arguments.index('--screenshot')+1]).write_bytes(PNG_1PX)
            return 0,{'data':{'ok':True,'screenshots':[{'page':'other'}]}},'{}'
        self.d.run=fake
        with self.assertRaisesRegex(RuntimeError,'different page'):
            self.d.action('capture',{'page':'wanted'})
        self.assertFalse(self.d.image_path.exists())
        self.assertEqual(self.d.capture_evidence['outcome'],'failed')

    def test_duplicate_image_across_pages_is_not_called_fresh(self):
        def fake(arguments,timeout=120):
            page=arguments[arguments.index('--page')+1]
            Path(arguments[arguments.index('--screenshot')+1]).write_bytes(PNG_1PX)
            return 0,{'data':{'ok':True,'screenshots':[{'page':page}]}},'{}'
        self.d.run=fake
        self.d.action('capture',{'page':'first'})
        result=self.d.action('capture',{'page':'second'})
        evidence=result['state']['captureEvidence']
        self.assertEqual(evidence['freshness'],'unverified-duplicate-across-pages')
        self.assertEqual(evidence['visualReview'],'pending')
        self.assertTrue(evidence['pageIdentityVerified'])

    def test_renderer_error_code_survives_in_journal(self):
        self.d.run=lambda *args,**kwargs:(1,{'error':{'code':'RENDER_FAILED','message':'Private renderer detail'}},'')
        with self.assertRaisesRegex(RuntimeError,'RENDER_FAILED'):
            self.d.action('capture',{'page':'first'})
        failure=self.d.journal.tail()[-1]
        self.assertEqual(failure['diagnosticCodes'],['RENDER_FAILED'])
        self.assertFalse(self.d.image_path.exists())

    def test_reload_refuses_unsaved_state(self):
        calls = []
        def fake(arguments, timeout=120):
            calls.append(arguments)
            if '--status' in arguments:
                return 0, {'ok': True, 'data': {'details': {'hasUnsavedChanges': True}}}, '{}'
            return 0, {'ok': True}, '{}'
        self.d.run = fake
        with self.assertRaisesRegex(RuntimeError, 'blocked'):
            self.d.action('reload')
        self.assertFalse(any('--reload' in a for a in calls))

    def test_reload_refuses_missing_safety_field(self):
        calls = []
        def fake(arguments, timeout=120):
            calls.append(arguments)
            return 0, {'ok': True, 'data': {}}, '{}'
        self.d.run = fake
        with self.assertRaisesRegex(RuntimeError, 'blocked'):
            self.d.action('reload')
        self.assertFalse(any('--reload' in a for a in calls))

    def test_reload_allows_explicit_false_after_validation(self):
        calls = []
        def fake(arguments, timeout=120):
            calls.append(arguments)
            if '--status' in arguments:
                return 0, {'ok': True, 'data': {'details': {'hasUnsavedChanges': False}}}, '{}'
            return 0, {'ok': True}, '{}'
        self.d.run = fake
        result = self.d.action('reload')
        self.assertTrue(result['ok'])
        self.assertEqual(calls[0][0], 'validate')
        self.assertIn('--status', calls[1])
        self.assertIn('--reload', calls[2])

    def test_attach_allows_only_structured_unavailable(self):
        calls = []
        def fake(arguments, timeout=120):
            calls.append(arguments)
            if '--status' in arguments:
                return 1, {'ok': False, 'error': {'code': 'HOST_UNAVAILABLE'}}, '{}'
            return 0, {'ok': True}, '{}'
        self.d.run = fake
        self.assertTrue(self.d.action('attach')['ok'])
        self.assertEqual(len(calls), 2)

    def test_page_filter_rejects_flags(self):
        self.d.run = Mock()
        with self.assertRaisesRegex(ValueError, 'Page ID'):
            self.d.action('capture', {'page': '--reload'})
        self.d.run.assert_not_called()


if __name__ == '__main__':
    unittest.main()

class SmartRefreshExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        project = root / 'Sample.pbip'
        project.write_text('{"artifacts":[{"report":{"path":"Example.Report"}}]}', encoding='utf-8')
        self.d = Designer(project, 'fake-cli', root / 'runtime', allow_model_writes=True)

    def tearDown(self):
        self.temp.cleanup()

    def test_run_requires_approval(self):
        plan = self.d.plan_smart_refresh({'changes': [{'kind': 'pbir'}], 'daxQueries': ['EVALUATE ROW("V",1)']})
        with self.assertRaisesRegex(RuntimeError, 'approval'):
            self.d.execute_smart_refresh({'planId': plan['planId']})

    def test_run_blocks_without_mcp_before_desktop_reload(self):
        plan = self.d.plan_smart_refresh({'changes': [{'kind': 'pbir'}], 'daxQueries': ['EVALUATE ROW("V",1)']})
        self.d.run = Mock()
        with self.assertRaisesRegex(RuntimeError, 'MCP adapter not configured'):
            self.d.execute_smart_refresh({'planId': plan['planId'], 'approved': True})
        self.d.run.assert_not_called()

    def test_run_refuses_blocked_plan(self):
        plan = self.d.plan_smart_refresh({'changes': [{'kind': 'unknown'}], 'daxQueries': ['EVALUATE ROW("V",1)']})
        with self.assertRaisesRegex(RuntimeError, 'blocked'):
            self.d.execute_smart_refresh({'planId': plan['planId'], 'approved': True})

class SmartRefreshSequenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        project = root / 'Example.pbip'
        project.write_text('{"artifacts":[{"report":{"path":"Example.Report"}}]}', encoding='utf-8')
        profile = root / 'profile.json'
        profile.write_text('{"desktopProcessingValidated":true}', encoding='utf-8')
        self.d = Designer(project, 'fake-cli', root / 'runtime', profile, allow_model_writes=True)

    def tearDown(self):
        self.temp.cleanup()

    def test_model_reload_process_dax_then_screenshot(self):
        from unittest.mock import patch
        trace = []
        def fake_run(arguments, timeout=120):
            trace.append(arguments)
            if '--status' in arguments:
                return 0, {'ok': True, 'data': {'details': {'hasUnsavedChanges': False}}}, '{}'
            if '--screenshot' in arguments:
                Path(arguments[arguments.index('--screenshot') + 1]).write_bytes(PNG_1PX)
            return 0, {'ok': True}, '{}'
        self.d.run = fake_run
        plan = self.d.plan_smart_refresh({'changes':[{'kind':'measure','fileEdit':True}], 'daxQueries':['EVALUATE ROW("V",1)'], 'tmdlValidated':True})
        with patch('server.MCPAdapter') as provider:
            provider.return_value.execute.return_value = [{'ok': True}]
            result = self.d.execute_smart_refresh({'planId':plan['planId'],'approved':True})
            provider.return_value.execute.assert_called_once()
        self.assertTrue(result['ok'])
        self.assertIn('--reload-with-model', trace[2])
        self.assertIn('--screenshot', trace[3])
        self.assertEqual(self.d.refresh_phase, 'completed_needs_review')

    def test_model_processing_failure_cannot_capture(self):
        from unittest.mock import patch
        trace = []
        def fake_run(arguments, timeout=120):
            trace.append(arguments)
            if '--status' in arguments:
                return 0, {'ok': True, 'data': {'details': {'hasUnsavedChanges': False}}}, '{}'
            return 0, {'ok': True}, '{}'
        self.d.run = fake_run
        plan = self.d.plan_smart_refresh({'changes':[{'kind':'measure','fileEdit':True}], 'daxQueries':['EVALUATE ROW("V",1)'], 'tmdlValidated':True})
        with patch('server.MCPAdapter') as provider:
            provider.return_value.execute.side_effect = RuntimeError('Processing unavailable')
            with self.assertRaisesRegex(RuntimeError, 'Processing unavailable'):
                self.d.execute_smart_refresh({'planId':plan['planId'],'approved':True})
        self.assertFalse(any('--screenshot' in a for a in trace))
        self.assertEqual(self.d.refresh_phase,'blocked_or_failed')
