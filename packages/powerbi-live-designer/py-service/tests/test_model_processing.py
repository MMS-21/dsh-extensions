import json
from pathlib import Path
import unittest
import test_change_sets as fixtures
from model_processing import ProcessingPlans

class FakeAdapter:
    def __init__(self):
        self.target={'processId':1,'port':1234,'startTime':'fixed','databaseId':'db','modelSha256':'a'*64}
        self.mode='success'
        self.writes=0
    def run(self,request,runtime,progress=lambda _:None):
        if request['operation']=='inspect':
            return dict(self.target)
        if request['operation']!='verify' and request['target']!=self.target:
            raise ValueError('model changed')
        if self.mode=='before':
            raise RuntimeError('connection unavailable')
        for table in ([] if request['operation']=='verify' else request['tables']):
            progress({'event':'dispatch','table':table})
            self.writes+=1
            if self.mode=='timeout':
                raise TimeoutError('unknown')
            progress({'event':'refreshed','table':table})
        return {'modelDataRefreshed':True,'verified':self.mode!='bad-count','observations':[]}

class ProcessingTests(unittest.TestCase):
    stage=fixtures.ChangeSetTests.stage
    approved=fixtures.ChangeSetTests.approved
    tearDown=fixtures.ChangeSetTests.tearDown
    # Helpers supply only synthetic PBIP files; no live model is modified.
    def setUp(self):
        fixtures.ChangeSetTests.setUp(self)
        record=self.approved()
        self.store.apply(record['id'],'session-a',record['digest'],lambda:None)
        applied=self.store.load(record['id'],'session-a')
        applied['reloadOutcome']='succeeded'
        self.store.save(applied)
        self.change_id=record['id']
        self.adapter=FakeAdapter()
        self.processing=ProcessingPlans(self.store,self.adapter,lambda:None)
        self.source=self.root/'synthetic.csv'
        self.source.write_text('value\n1\n2\n3\n')
    def request(self):
        from change_sets import sha
        return {'changeSetId':self.change_id,'tables':['Fixture'],
                'checks':[{'table':'Fixture','minRows':3,'maxRows':3}],
                'sourceFiles':[{'path':str(self.source),'sha256':sha(self.source.read_bytes())}],
                'sourceSummary':'Synthetic local three-row CSV; no external credentials.'}
    def staged(self):
        return self.processing.stage('session-a',self.request())
    def refresh_approved(self):
        record=self.staged()
        return record
    def test_refresh_inherits_task_authorization_without_another_command(self):
        record=self.staged()
        self.assertEqual(self.adapter.writes,0)
        self.assertEqual(record['status'],'ready')
        self.assertIsNone(record['approval'])
        self.assertEqual(record['authorization']['source'],'approved-change-set')
        result=self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(result['status'],'verified')
        self.assertEqual(self.adapter.writes,1)

    def test_processing_exact_approval_and_no_repeat(self):
        record=self.refresh_approved()
        result=self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(result['status'],'verified')
        self.assertEqual(result['completedTables'],['Fixture'])
        with self.assertRaises(ValueError):
            self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(self.adapter.writes,1)
    def test_changed_source_stops_before_write(self):
        record=self.refresh_approved()
        self.source.write_text('changed')
        with self.assertRaisesRegex(ValueError,'fingerprint'):
            self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(self.adapter.writes,0)
    def test_changed_model_stops_before_write(self):
        record=self.refresh_approved()
        self.adapter.target['modelSha256']='b'*64
        with self.assertRaises(ValueError):
            self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(self.adapter.writes,0)
    def test_timeout_unknown_blocks_restage_on_same_instance(self):
        record=self.refresh_approved()
        self.adapter.mode='timeout'
        with self.assertRaises(TimeoutError):
            self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(self.processing.load(record['id'],'session-a')['status'],'unknown')
        with self.assertRaisesRegex(ValueError,'Unresolved'):
            self.staged()
        with self.assertRaises(ValueError):
            self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(self.adapter.writes,1)
    def test_row_count_failure_preserves_refresh_evidence(self):
        record=self.refresh_approved()
        self.adapter.mode='bad-count'
        result=self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(result['status'],'verification-failed')
        self.assertEqual(result['completedTables'],['Fixture'])
        self.assertFalse(result['runtimeRollbackAvailable'])
    def test_project_session_and_digest_are_bound(self):
        record=self.staged()
        with self.assertRaises(ValueError):
            self.processing.approve(record['id'],'session-b',record['digest'])
        with self.assertRaises(ValueError):
            self.processing.approve(record['id'],'session-a','0'*64)
    def test_missing_reload_and_incomplete_checks_are_rejected(self):
        request=self.request();request['checks']=[]
        with self.assertRaises(ValueError):self.processing.stage('session-a',request)
        change=self.store.load(self.change_id,'session-a');change.pop('reloadOutcome');self.store.save(change)
        with self.assertRaisesRegex(ValueError,'reloaded'):self.staged()

    def test_interrupted_process_is_persisted_and_not_retryable(self):
        record=self.refresh_approved()
        interrupted=self.processing.load(record['id'],'session-a')
        interrupted['status']='running'
        self.processing.save(interrupted)
        fresh=ProcessingPlans(self.store,self.adapter,lambda:None)
        with self.assertRaises(ValueError):fresh.execute(record['id'],'session-a',record['digest'])
        with self.assertRaisesRegex(ValueError,'Unresolved'):fresh.stage('session-a',self.request())
        self.assertEqual(self.adapter.writes,0)

    def test_review_result_does_not_embed_entire_project_inventory(self):
        record=self.staged()
        self.assertNotIn('baseline',record['identity'])
        self.assertNotIn('session',record['identity'])
        self.assertTrue(Path(record['manifestPath']).is_file())

    def test_parent_approval_removed_or_rolled_back_stops_execution(self):
        record=self.staged()
        parent=self.store.load(self.change_id,'session-a')
        parent['approval']=None
        self.store.save(parent)
        with self.assertRaisesRegex(ValueError,'user-authorized'):
            self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(self.adapter.writes,0)

    def test_old_staged_refresh_inherits_existing_task_authorization(self):
        record=self.staged()
        legacy=self.processing.load(record['id'],'session-a')
        legacy.pop('authorization')
        legacy['status']='staged'
        self.processing.save(legacy)
        result=self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(result['status'],'verified')
        self.assertEqual(result['authorization']['source'],'approved-change-set')

    def test_cross_session_cannot_run_inherited_authorization(self):
        record=self.staged()
        with self.assertRaisesRegex(ValueError,'session'):
            self.processing.execute(record['id'],'session-b',record['digest'])
        self.assertEqual(self.adapter.writes,0)

    def test_staging_without_authorized_parent_is_rejected(self):
        parent=self.store.load(self.change_id,'session-a')
        parent['approval']=None
        self.store.save(parent)
        with self.assertRaisesRegex(ValueError,'user-authorized'):
            self.staged()
        self.assertEqual(self.adapter.writes,0)

    def test_reloaded_change_replay_never_reloads_the_model_again(self):
        from server import Designer
        designer=Designer(self.project,'fake-cli',self.runtime)
        designer.run=lambda *args,**kwargs:self.fail('Replay must not invoke Desktop')
        parent=self.store.load(self.change_id,'session-a')
        result=designer.change_operation('reload',{'sessionId':'session-a','id':parent['id'],'digest':parent['digest']})
        self.assertTrue(result['alreadyReloaded'])
        self.assertTrue(result['runtimeDataPreserved'])

    def test_post_refresh_redraw_is_report_only_and_idempotent(self):
        from server import Designer
        record=self.refresh_approved()
        self.processing.execute(record['id'],'session-a',record['digest'])
        designer=Designer(self.project,'fake-cli',self.runtime)
        calls=[]
        designer.run=lambda args,**kwargs:(calls.append(args) or (0,{'ok':True},''))
        done=designer.finish_processing_canvas(self.processing,self.processing.load(record['id'],'session-a'))
        self.assertTrue(done['postCanvasVerification']['verified'])
        self.assertEqual(self.adapter.writes,1)
        self.assertEqual(sum('--reload' in call for call in calls),1)
        self.assertFalse(any('--reload-with-model' in call for call in calls))
        designer.finish_processing_canvas(self.processing,self.processing.load(record['id'],'session-a'))
        self.assertEqual(sum('--reload' in call for call in calls),1)
        self.assertEqual(self.adapter.writes,1)

    def test_completed_redraw_with_missing_verification_only_retries_reads(self):
        from server import Designer
        record=self.refresh_approved()
        self.processing.execute(record['id'],'session-a',record['digest'])
        saved=self.processing.load(record['id'],'session-a');saved['canvasReloadOutcome']='succeeded';self.processing.save(saved)
        designer=Designer(self.project,'fake-cli',self.runtime)
        calls=[];designer.run=lambda args,**kwargs:(calls.append(args) or (0,{'ok':True},''))
        done=designer.finish_processing_canvas(self.processing,saved)
        self.assertTrue(done['postCanvasVerification']['verified'])
        self.assertFalse(any('--reload' in call for call in calls))
        self.assertEqual(self.adapter.writes,1)

    def test_refresh_inherits_automatic_task_authorization(self):
        change=self.store.load(self.change_id,'session-a')
        change['approval']={'digest':change['digest'],'source':'task-workflow'}
        self.store.save(change)
        record=self.staged()
        result=self.processing.execute(record['id'],'session-a',record['digest'])
        self.assertEqual(result['status'],'verified')
        self.assertEqual(self.adapter.writes,1)
