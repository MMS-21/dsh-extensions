import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Designer, BlockedOperation, CliOperationError
from semantic_inspection import inspect_semantic_model, report_directory
from operation_journal import OperationJournal


class InspectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.project = self.root / 'HR.pbip'
        self.project.write_text(json.dumps({'artifacts': [{'report': {'path': 'HR.Report'}}]}))
        self.report = self.root / 'HR.Report'
        self.report.mkdir()
        (self.report / 'definition.pbir').write_text(json.dumps({'datasetReference': {'byPath': {'path': '../HR.SemanticModel'}}}))
        self.model = self.root / 'HR.SemanticModel'
        (self.model / 'definition/tables').mkdir(parents=True)
        self.table = self.model / 'definition/tables/Employees.tmdl'
        self.table.write_text("table Employees\n\tcolumn EmployeeId\n\t\tdataType: int64\n\tmeasure 'Employee Count' = COUNTROWS(Employees)\n\tpartition Employees = m\n\t\tsource = secret_connection_string\n")
        self.designer = Designer(self.project, 'fake-cli', self.root / 'runtime')

    def tearDown(self):
        self.temp.cleanup()

    def test_semantic_inventory_is_read_only_and_excludes_expressions_and_sources(self):
        before = hashlib.sha256(self.table.read_bytes()).hexdigest()
        result = self.designer.semantic()['model']
        self.assertEqual(before, hashlib.sha256(self.table.read_bytes()).hexdigest())
        self.assertEqual(result['tables'][0]['measures'], [{'name': 'Employee Count'}])
        self.assertNotIn('secret_connection_string', json.dumps(result))
        self.assertNotIn('COUNTROWS', json.dumps(result))
        self.assertTrue(result['warnings'])

    def test_remote_models_are_not_queried(self):
        (self.report / 'definition.pbir').write_text('{"datasetReference":{"byConnection":{"connectionString":"secret"}}}')
        with self.assertRaisesRegex(ValueError, 'No local semantic'):
            inspect_semantic_model(self.project)

    def test_paths_cannot_escape_project_directory(self):
        (self.report / 'definition.pbir').write_text('{"datasetReference":{"byPath":{"path":"../../outside"}}}')
        with self.assertRaisesRegex(ValueError, 'escapes'):
            inspect_semantic_model(self.project)

    def test_preview_uses_report_folder_and_rejects_pbix(self):
        self.assertEqual(Path(self.designer.preview_arguments('--status')[1]), self.report.resolve())
        with self.assertRaisesRegex(ValueError, 'PBIX'):
            report_directory(self.root / 'HR.pbix')

    def test_readiness_requires_structured_desktop_status(self):
        self.designer.run = Mock(return_value=(0, {'data': {}}, ''))
        self.assertFalse(self.designer.readiness()['ready'])
        self.designer.run.return_value = (0, {'data': {'details': {'hasUnsavedChanges': True}}}, '')
        readiness = self.designer.readiness()
        self.assertTrue(readiness['ready'])
        self.assertTrue(readiness['checks']['unsavedChanges'])
        self.assertFalse(readiness['state']['modelWritesEnabled'])

    def test_model_processing_is_blocked_before_external_calls(self):
        self.designer.run = Mock()
        plan = self.designer.plan_smart_refresh({'changes': [{'kind': 'pbir'}], 'daxQueries': ['EVALUATE ROW("V",1)']})
        with self.assertRaises(BlockedOperation):
            self.designer.execute_smart_refresh({'planId': plan['planId'], 'approved': True})
        self.designer.run.assert_not_called()
        self.assertEqual(self.designer.journal.tail()[-1]['outcome'], 'blocked')

    def test_timeout_is_unknown_and_raw_diagnostic_is_not_logged(self):
        def fail():
            raise TimeoutError('credential=secret')
        with self.assertRaises(TimeoutError):
            self.designer.journal.run('reload', fail)
        entries = self.designer.journal.tail()
        self.assertEqual(entries[-1]['outcome'], 'unknown')
        self.assertNotIn('secret', json.dumps(entries))
        self.assertEqual(entries[0]['operationId'], entries[1]['operationId'])
        self.assertEqual(OperationJournal(self.designer.journal.path).tail(), entries)

    def test_design_plan_and_feedback_do_not_grant_write_approval(self):
        plan = self.designer.plan_design({'audience':'HR managers', 'questions':['Where is attrition concentrated?'],
            'metrics':['Attrition rate (definition unconfirmed)'], 'assumptions':[],
            'pages':[{'title':'Overview','visuals':[{'question':'Where?', 'measure':'Attrition rate',
                'dimension':'Department','acceptance':'Matches the confirmed denominator'}]}]})
        self.assertFalse(plan['reportChanged'])
        self.assertTrue(Path(plan['path']).is_file())
        self.assertEqual(self.designer.journal.tail()[-1]['planId'], plan['planId'])
        result = self.designer.review_design({'planId':plan['planId'],'source':'user-feedback',
            'expected':'Overview','observed':'Needs department comparison','evidence':['User request'],
            'severity':'improvement','nextAction':'Revise proposed overview'})
        self.assertFalse(result['executionApproved'])
        self.assertEqual(self.designer.journal.tail()[-1]['operation'], 'design-review')
        self.assertFalse(self.designer.allow_model_writes)

    def test_review_rejects_path_traversal(self):
        with self.assertRaisesRegex(ValueError, 'Invalid design plan'):
            self.designer.review_design(dict(planId='../other',source='agent-finding',expected='x',observed='x',
                                            evidence=[],severity='blocker',nextAction='Stop'))

    def test_missing_measure_acceptance_is_rejected(self):
        with self.assertRaises(ValueError):
            self.designer.plan_design({'audience':'HR','questions':['Why?'], 'pages':[{'title':'Overview','visuals':[{}]}]})

    def test_zero_exit_validation_failure_is_logged_with_action_and_safe_details(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        payload = {'data': {'result':'failed','errorCount':2,'warningCount':1,'diagnostics':{
            'PBIR_JSON_FILE_NO_SCHEMA':{'items':[{'message':'credential=secret'}]},
            'PBIR_SCHEMA_UNREACHABLE':{'items':[]}}}}
        with patch('server.subprocess.run', return_value=SimpleNamespace(returncode=0,stdout=json.dumps(payload),stderr='')):
            result = self.designer.validation_report()
        self.assertEqual(result['validation']['result'], 'failed')
        self.assertEqual(result['validation']['schemaCoverage'], 'incomplete')
        self.assertEqual(result['validation']['desktopCompatibility'], 'not-established-by-this-check')
        entries = self.designer.journal.tail()
        failure = next(e for e in entries if e['operation']=='desktop:validate' and e['outcome']=='failed')
        self.assertEqual(failure['errorCount'], 2)
        self.assertEqual(failure['exitCode'], 0)
        self.assertIn('PBIR_JSON_FILE_NO_SCHEMA', failure['diagnosticCodes'])
        self.assertEqual(failure['externalEffect'], 'read-only-dispatched')
        self.assertEqual(failure['mutationOutcome'], 'not-attempted')
        self.assertNotIn('secret', json.dumps(entries))
        self.assertEqual(entries[-1]['operation'], 'project-validation')
        self.assertEqual(entries[-1]['outcome'], 'blocked')
        self.assertEqual(entries[-1]['externalEffect'], 'read-only-dispatched')

    def test_reload_never_follows_structured_validation_failure_even_on_zero_exit(self):
        self.designer.run = Mock(return_value=(0, {'data':{'result':'failed','errorCount':1}}, ''))
        with self.assertRaises(CliOperationError):
            self.designer.action('reload')
        self.assertEqual(self.designer.run.call_count, 1)
        self.assertEqual(self.designer.run.call_args.args[0][0], 'validate')

    def test_unexpected_binding_key_is_rejected_in_visual(self):
        brief = {'audience':'HR', 'questions':['Why?'], 'pages':[{'title':'Overview', 'visuals':[
            {'question':'Why?','measure':'Count','dimension':'Department','acceptance':'Matches source','binding':'extra'}]}]}
        with self.assertRaisesRegex(ValueError, 'Each visual requires'):
            self.designer.plan_design(brief)
