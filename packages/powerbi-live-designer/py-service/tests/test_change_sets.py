import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from change_sets import ChangeSets, sha
from operation_journal import OperationJournal


class ChangeSetTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.project=self.root/'fixture.pbip'
        self.project.write_text('{"artifacts":[{"report":{"path":"fixture.Report"}}]}')
        self.report=self.root/'fixture.Report'
        self.report.mkdir()
        (self.report/'definition.pbir').write_text('{"datasetReference":{"byPath":{"path":"../fixture.SemanticModel"}}}')
        (self.root/'fixture.SemanticModel').mkdir()
        self.file=self.report/'page.json'
        self.file.write_text('{"title":"Before"}')
        self.runtime=self.root/'runtime'
        self.runtime.mkdir()
        self.plan_id='a'*32
        (self.runtime/f'design-{self.plan_id}.json').write_text(json.dumps({'project':str(self.project.resolve())}))
        self.store=ChangeSets(self.project,self.runtime,OperationJournal(self.runtime/'operations.jsonl'))

    def tearDown(self):
        self.temp.cleanup()

    def stage(self, files=None):
        return self.store.stage('session-a',{'planId':self.plan_id,'summary':'Synthetic metadata change',
          'files':files or [{'path':'fixture.Report/page.json','content':'{"title":"After"}',
                            'beforeSha256':sha(self.file.read_bytes())}]})

    def approved(self, files=None):
        record=self.stage(files)
        self.store.validate(record['id'],'session-a',lambda _: {'passed':True,'fixture':True})
        self.store.approve(record['id'],'session-a',record['digest'])
        return record

    def test_staging_changes_only_isolated_copy(self):
        before=self.file.read_bytes()
        result=self.stage()
        self.assertEqual(self.file.read_bytes(),before)
        self.assertEqual(result['status'],'staged')
        self.assertTrue(Path(result['diffPath']).is_file())

    def test_apply_requires_exact_native_approval(self):
        record=self.stage()
        with self.assertRaisesRegex(ValueError,'approval'):
            self.store.apply(record['id'],'session-a',record['digest'],lambda:None)
        self.store.validate(record['id'],'session-a',lambda _: {'passed':True})
        with self.assertRaisesRegex(ValueError,'exact validated'):
            self.store.approve(record['id'],'session-a','0'*64)

    def test_validation_failure_cannot_be_approved(self):
        record=self.stage()
        self.store.validate(record['id'],'session-a',lambda _: {'passed':False})
        with self.assertRaises(ValueError):
            self.store.approve(record['id'],'session-a',record['digest'])

    def test_approved_apply_and_rollback_survive_store_recreation(self):
        before=self.file.read_bytes()
        record=self.approved()
        restored=ChangeSets(self.project,self.runtime,self.store.journal)
        result=restored.apply(record['id'],'session-a',record['digest'],lambda:None)
        self.assertEqual(result['status'],'applied')
        self.assertEqual(json.loads(self.file.read_text())['title'],'After')
        result=restored.rollback(record['id'],'session-a',record['digest'],lambda:None)
        self.assertEqual(result['status'],'rolled-back')
        self.assertEqual(self.file.read_bytes(),before)
        with self.assertRaises(ValueError):
            restored.apply(record['id'],'session-a',record['digest'],lambda:None)

    def test_live_or_staged_changes_invalidate_approval(self):
        record=self.approved()
        self.file.write_text('{"title":"User edit"}')
        with self.assertRaisesRegex(ValueError,'Live project changed'):
            self.store.apply(record['id'],'session-a',record['digest'],lambda:None)
        self.assertEqual(json.loads(self.file.read_text())['title'],'User edit')

    def test_stage_tampering_is_rejected(self):
        record=self.approved()
        (self.store.directory/record['id']/'project/fixture.Report/page.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'Staged project changed'):
            self.store.apply(record['id'],'session-a',record['digest'],lambda:None)

    def test_cross_session_and_traversal_rejected(self):
        record=self.stage()
        with self.assertRaisesRegex(ValueError,'another project or session'):
            self.store.load(record['id'],'session-b')
        for path in ['../outside.json','/absolute.json','fixture.Report/../../outside.json','fixture.Report/code.py','other.Report/page.json']:
            with self.assertRaises(ValueError):
                self.stage([{'path':path,'content':'{}','beforeSha256':None}])

    def test_preflight_failure_keeps_live_files_unchanged(self):
        record=self.approved()
        before=self.file.read_bytes()
        def fail(): raise RuntimeError('Unsaved changes')
        with self.assertRaises(RuntimeError):
            self.store.apply(record['id'],'session-a',record['digest'],fail)
        self.assertEqual(self.file.read_bytes(),before)

    def test_rollback_refuses_subsequent_user_edit(self):
        record=self.approved()
        self.store.apply(record['id'],'session-a',record['digest'],lambda:None)
        self.file.write_text('{"title":"Later user edit"}')
        with self.assertRaisesRegex(ValueError,'edited after'):
            self.store.rollback(record['id'],'session-a',record['digest'],lambda:None)

    def test_partial_application_failure_restores_first_file(self):
        files=[{'path':'fixture.Report/page.json','content':'{"title":"After"}','beforeSha256':sha(self.file.read_bytes())},
               {'path':'fixture.Report/second.json','content':'{}','beforeSha256':None}]
        record=self.approved(files)
        before=self.file.read_bytes()
        import change_sets
        actual=change_sets.atomic_bytes
        def failure(path,data):
            if path.name=='second.json': raise OSError('Simulated disk failure')
            return actual(path,data)
        with patch('change_sets.atomic_bytes',side_effect=failure):
            with self.assertRaises(OSError):
                self.store.apply(record['id'],'session-a',record['digest'],lambda:None)
        self.assertEqual(self.file.read_bytes(),before)
        self.assertFalse((self.report/'second.json').exists())
        self.assertEqual(self.store.load(record['id'],'session-a')['status'],'rolled-back')

    def test_changed_project_reference_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'project report references'):
            self.stage([{'path':'fixture.pbip','content':'{"artifacts":[]}',
                         'beforeSha256':sha(self.project.read_bytes())}])

    def test_interrupted_application_can_be_restored_from_persisted_checkpoint(self):
        record=self.approved()
        before=self.file.read_bytes()
        import change_sets
        actual=change_sets.atomic_bytes
        def interrupted(path,data):
            actual(path,data)
            raise KeyboardInterrupt('Simulated process interruption')
        with patch('change_sets.atomic_bytes',side_effect=interrupted):
            with self.assertRaises(KeyboardInterrupt):
                self.store.apply(record['id'],'session-a',record['digest'],lambda:None)
        self.assertEqual(self.store.load(record['id'],'session-a')['status'],'applying')
        restarted=ChangeSets(self.project,self.runtime,self.store.journal)
        result=restarted.rollback(record['id'],'session-a',record['digest'],lambda:None)
        self.assertEqual(result['status'],'rolled-back')
        self.assertEqual(self.file.read_bytes(),before)
