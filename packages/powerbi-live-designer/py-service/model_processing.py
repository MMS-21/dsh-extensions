"""Table refreshes covered by an approved change set, separate from definition reload/file rollback."""
import hashlib
import json
import os
import queue
import re
import subprocess
import threading
from pathlib import Path
from uuid import uuid4
from change_sets import atomic_json, sha
from operation_journal import mark_external_effect


def fingerprint_file(value):
    if not isinstance(value,dict) or set(value)!={'path','sha256'}:
        raise ValueError('Each source file requires path and sha256')
    path=Path(value['path'])
    if not path.is_absolute() or str(path).startswith(('\\\\','//')) or path.is_symlink() or path.is_junction():
        raise ValueError('Source must be a local absolute regular file')
    if not path.is_file() or path.stat().st_size>512_000_000:
        raise ValueError('Source missing or exceeds 512 MB fingerprint budget')
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):
            digest.update(block)
    if digest.hexdigest()!=value['sha256']:
        raise ValueError('Source fingerprint changed; restage refresh')
    return {'path':str(path.resolve()),'sha256':digest.hexdigest()}


class OfficialRefreshAdapter:
    def __init__(self, executable, node=None):
        self.executable=executable
        self.node=node or __import__('shutil').which('node')

    def run(self, request, runtime, progress=lambda _:None):
        if not self.node or not self.executable or not Path(self.executable).is_file():
            raise ValueError('Official modeling server is not configured')
        script=Path(__file__).resolve().parent.parent/'model-refresh.mjs'
        input_path=runtime/f'refresh-request-{uuid4().hex}.json'
        atomic_json(input_path,request)
        environment=dict(os.environ,PBI_MODELING_MCP_EXE=str(self.executable))
        # Acceptance was explicitly granted by the operator; main propagates it.
        stream=None
        mark_external_effect('read-only-dispatched')
        try:
            stream=subprocess.Popen([self.node,str(script),str(input_path)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                                    text=True,encoding='utf-8',env=environment,shell=False,
                                    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            events=queue.Queue()
            def read():
                try:
                    for line in stream.stdout:
                        if len(line)>65536:
                            events.put(None)
                            return
                        events.put(line)
                finally:
                    events.put(None)
            threading.Thread(target=read,daemon=True).start()
            result=None
            import time
            deadline=time.monotonic()+360
            while True:
                remaining=deadline-time.monotonic()
                if remaining<=0:
                    raise TimeoutError('Refresh adapter timed out; outcome unknown; do not repeat')
                try:
                    line=events.get(timeout=remaining)
                except queue.Empty:
                    raise TimeoutError('Refresh adapter timed out; outcome unknown; do not repeat')
                if line is None:
                    break
                item=json.loads(line)
                if item.get('event')=='result':
                    result=item['result']
                elif item.get('event')=='error':
                    code=item.get('code','MODELING_ADAPTER_FAILED')
                    stage=item.get('stage','adapter')
                    error=RuntimeError(f'Official modeling operation failed ({code}, stage={stage}); inspect refresh record')
                    error.diagnostic_codes=[code] if isinstance(code,str) and re.fullmatch('[A-Z0-9_]{1,80}',code) else []
                    error.stage=stage
                    raise error
                else:
                    progress(item)
                    if item.get('event')=='dispatch':
                        stream.stdin.write('dispatch-recorded\n')
                        stream.stdin.flush()
            code=stream.wait(timeout=5)
            if code or result is None:
                raise RuntimeError('Official modeling operation did not complete')
            return result
        finally:
            input_path.unlink(missing_ok=True)
            if stream is not None:
                if stream.poll() is None:
                    # The model server may already have dispatched work; never imply rollback.
                    subprocess.run(['taskkill','/PID',str(stream.pid),'/T','/F'],capture_output=True,timeout=10) if os.name=='nt' else stream.kill()
                if stream.stdout:
                    stream.stdout.close()
                if stream.stdin:
                    stream.stdin.close()


class ProcessingPlans:
    def __init__(self, changes, adapter, preflight):
        self.changes=changes
        self.adapter=adapter
        self.preflight=preflight
        self.directory=changes.directory.parent/'processing-plans'
        self.directory.mkdir(exist_ok=True)

    def save(self, record):
        atomic_json(self.directory/(record['id']+'.json'),record)

    def load(self, identity, session):
        if not isinstance(identity,str) or not re.fullmatch('[a-f0-9]{32}',identity):
            raise ValueError('Invalid refresh id')
        record=json.loads((self.directory/(identity+'.json')).read_text(encoding='utf-8'))
        if record['identity']['session']!=session or record['identity']['project']!=str(self.changes.project):
            raise ValueError('Refresh belongs to another project/session')
        if sha(json.dumps(record['identity'],sort_keys=True).encode())!=record['digest']:
            raise ValueError('Refresh manifest checksum mismatch')
        return record

    def describe(self, record):
        visible={**record,'identity':{key:value for key,value in record['identity'].items() if key not in ('baseline','session')}}
        return {**visible,'ok':True,'manifestPath':str(self.directory/(record['id']+'.json')),'runtimeRollbackAvailable':False,
                'warning':'Full refresh reads configured data sources; completed table refreshes cannot be undone by file rollback.'}

    def authorization(self, change_id, session, digest=None):
        change=self.changes.load(change_id,session)
        self.changes.verify(change,baseline=False)
        expected={'digest':change['digest'],'source':'native-user-command'}
        if change['status']!='applied' or change.get('reloadOutcome')!='succeeded' or change.get('approval') not in (expected,{'digest':change['digest'],'source':'task-workflow'}):
            raise ValueError('Refresh requires a successfully reloaded, user-authorized applied change set')
        if digest is not None and change['digest']!=digest:
            raise ValueError('Parent change-set authorization changed; restage refresh')
        return {'source':'approved-change-set','changeSetId':change_id,'digest':change['digest']}

    def verify(self, record):
        identity=record['identity']
        authorization=self.authorization(identity['changeSetId'],identity['session'],identity['changeDigest'])
        if record.get('authorization') not in (None,authorization):
            raise ValueError('Refresh authorization does not match the approved change set')
        if self.changes.snapshot()!=identity['baseline']:
            raise ValueError('Project definitions changed; restage refresh')
        for source in identity['sourceFiles']:
            fingerprint_file(source)
        self.preflight()

    def stage(self, session, value):
        if not isinstance(value,dict) or set(value)!={'changeSetId','tables','checks','sourceFiles','sourceSummary'}:
            raise ValueError('Provide changeSetId, tables, checks, sourceFiles, sourceSummary')
        authorization=self.authorization(value['changeSetId'],session)
        change=self.changes.load(value['changeSetId'],session)
        self.changes.verify(change,baseline=False)
        expected=dict(change['baseline'])
        expected.update({item['path']:item['afterSha256'] for item in change['files']})
        baseline=self.changes.snapshot()
        if expected!=baseline:
            raise ValueError('Project changed since applied definitions; restage file changes')
        tables=value['tables']
        if not isinstance(tables,list) or not 1<=len(tables)<=20 or any(not isinstance(t,str) or not 1<=len(t)<=200 for t in tables) or len(set(tables))!=len(tables):
            raise ValueError('Name 1–20 distinct affected tables')
        checks=value['checks']
        if not isinstance(checks,list) or len(checks)!=len(tables):
            raise ValueError('Provide one row-count range per table')
        for check in checks:
            if not isinstance(check,dict) or set(check)!={'table','minRows','maxRows'} or type(check['minRows']) is not int or type(check['maxRows']) is not int or not 0<=check['minRows']<=check['maxRows']<=9007199254740991:
                raise ValueError('Invalid row-count acceptance range')
        if sorted(c['table'] for c in checks)!=sorted(tables):
            raise ValueError('Checks must cover affected tables exactly')
        sources=value['sourceFiles']
        if not isinstance(sources,list) or len(sources)>20:
            raise ValueError('Provide up to 20 local source fingerprints')
        sources=[fingerprint_file(source) for source in sources]
        if not isinstance(value['sourceSummary'],str) or not 1<=len(value['sourceSummary'])<=2000:
            raise ValueError('Describe the configured data sources and external effects')
        self.preflight()
        target=self.adapter.run({'operation':'inspect','project':str(self.changes.project),'tables':tables},self.directory)
        self.reject_unresolved(target)
        identity={'project':str(self.changes.project),'session':session,'changeSetId':change['id'],'changeDigest':change['digest'],
                  'baseline':baseline,'target':target,'tables':tables,'checks':checks,'sourceFiles':sources,
                  'sourceSummary':value['sourceSummary'],'refreshType':'Full'}
        record={'id':uuid4().hex,'digest':sha(json.dumps(identity,sort_keys=True).encode()),'identity':identity,'status':'ready','approval':None,'authorization':authorization,'completedTables':[]}
        self.save(record)
        self.changes.journal.append('processing-stage','succeeded',refreshId=record['id'],digest=record['digest'],authorizationSource='approved-change-set',changeSetId=change['id'])
        return self.describe(record)

    def reject_unresolved(self, target, exclude=None):
        for path in self.directory.glob('*.json'):
            if not re.fullmatch('[a-f0-9]{32}',path.stem) or path.stem==exclude:
                continue
            previous=json.loads(path.read_text(encoding='utf-8'))
            if previous.get('status') not in ('running','unknown'):
                continue
            old=previous['identity']['target']
            if all(old.get(key)==target.get(key) for key in ('processId','port','startTime')):
                raise ValueError('Unresolved refresh on this Desktop instance; inspect it and restart Desktop before staging another refresh')

    def approve(self, identity, session, digest):
        record=self.load(identity,session)
        if record['digest']!=digest or record['status'] not in ('staged','ready'):
            raise ValueError('Approve the exact staged refresh digest')
        self.verify(record)
        record.update(status='approved',approval={'digest':digest,'source':'native-user-command'})
        self.save(record)
        self.changes.journal.append('processing-approval','recorded',refreshId=identity,digest=digest)
        return self.describe(record)

    def execute(self, identity, session, digest):
        record=self.load(identity,session)
        if record['digest']!=digest or record['status'] not in ('staged','ready','approved'):
            raise ValueError('Exact refresh digest and authorized task required; completed/unknown refreshes cannot be repeated')
        self.verify(record)
        record['authorization']=self.authorization(record['identity']['changeSetId'],session,record['identity']['changeDigest'])
        self.reject_unresolved(record['identity']['target'],exclude=identity)
        record['status']='running'
        self.save(record) # A process crash leaves a non-retryable record.
        dispatched=False
        def progress(item):
            nonlocal dispatched
            table=item.get('table')
            if item.get('event')=='dispatch' and table in record['identity']['tables']:
                dispatched=True
                record.update(status='unknown',activeTable=table)
                self.save(record) # Persist before allowing the next write to proceed (see adapter handshake).
                mark_external_effect('write-dispatched')
                self.changes.journal.append('processing-table','started',refreshId=identity,table=table)
            elif item.get('event')=='refreshed' and table in record['identity']['tables']:
                record['completedTables'].append(table)
                self.save(record)
                self.changes.journal.append('processing-table','succeeded',refreshId=identity,table=table)
        request={'operation':'refresh',**{key:record['identity'][key] for key in ('project','tables','checks','target')}}
        try:
            result=self.adapter.run(request,self.directory,progress)
            if result.get('modelDataRefreshed') is not True or set(record['completedTables'])!=set(request['tables']):
                raise RuntimeError('Refresh returned incomplete execution evidence')
            if self.changes.snapshot()!=record['identity']['baseline']:
                raise RuntimeError('Project changed during refresh; verification cannot be accepted')
            for source in record['identity']['sourceFiles']:
                fingerprint_file(source)
            record.update(status='verified' if result.get('verified') is True else 'verification-failed',result=result)
            self.save(record)
            self.changes.journal.append('processing-verification', 'succeeded' if result.get('verified') else 'failed',refreshId=identity)
            return self.describe(record)
        except BaseException as error:
            record['diagnosticCodes']=getattr(error,'diagnostic_codes',[])
            record['failureStage']=getattr(error,'stage','adapter')
            record['status']='unknown' if dispatched else 'failed-before-dispatch'
            self.save(record)
            self.changes.journal.append('processing-execution',record['status'],refreshId=identity,
                                        runtimeRollbackAvailable=False)
            raise
