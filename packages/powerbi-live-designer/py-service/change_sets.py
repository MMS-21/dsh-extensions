"""Generic staged PBIP file changes; no business-specific report generation."""
import difflib
import hashlib
import json
import os
import re
import shutil
import threading
import tempfile
from pathlib import Path, PurePosixPath
from uuid import uuid4
from operation_journal import mark_external_effect


def sha(data):
    return hashlib.sha256(data).hexdigest()


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    os.replace(temporary, path)


def atomic_bytes(path, data):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent,prefix='.dsh-',delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary,path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


class ChangeSets:
    def __init__(self, project, runtime, journal):
        self.project = project.resolve()
        self.root = self.project.parent
        self.directory = runtime / 'change-sets'
        self.directory.mkdir(parents=True, exist_ok=True)
        self.journal = journal
        self.lock = threading.RLock()

    def roots(self):
        from semantic_inspection import report_directory
        report = report_directory(self.project)
        definition = json.loads((report/'definition.pbir').read_text(encoding='utf-8-sig'))
        reference = definition.get('datasetReference', {}).get('byPath', {}).get('path')
        roots = [report]
        if reference:
            model = (report/reference).resolve()
            if not model.is_relative_to(self.root):
                raise ValueError('Model reference escapes project directory')
            roots.append(model)
        return roots

    def target(self, relative):
        if not isinstance(relative, str) or '\\' in relative or ':' in relative:
            raise ValueError('Use a project-relative forward-slash path')
        pure = PurePosixPath(relative)
        if pure.is_absolute() or not pure.parts or any(p in ('.', '..', '.pbi') for p in pure.parts):
            raise ValueError('Unsafe change path')
        candidate = self.root.joinpath(*pure.parts)
        resolved = candidate.resolve()
        if not resolved.is_relative_to(self.root):
            raise ValueError('Change path escapes project directory')
        if resolved != self.project and not any(resolved.is_relative_to(root) for root in self.roots()):
            raise ValueError('Change is outside this report and semantic model')
        if candidate.suffix.lower() not in ('.json','.tmdl','.pbip','.pbir','.pbism'):
            raise ValueError('Only report/model definition text files can be staged')
        # Resolved symlinks are rejected even when they point back into the project.
        cursor = candidate
        while cursor != self.root:
            if cursor.is_symlink() or cursor.is_junction():
                raise ValueError('Links and junctions are not writable change targets')
            cursor = cursor.parent
        return candidate

    def snapshot(self):
        files = [self.project]
        for root in self.roots():
            if not root.is_dir():
                raise ValueError('Referenced project directory is missing')
            for file in root.rglob('*'):
                if '.pbi' in file.relative_to(root).parts:
                    continue
                if file.is_symlink() or file.is_junction():
                    raise ValueError('Linked project content is not supported')
                if file.is_file():
                    files.append(file)
        if len(files) > 10000:
            raise ValueError('Project staging file budget exceeded')
        result = {}
        total = 0
        for file in files:
            total += file.stat().st_size
            if total > 128_000_000:
                raise ValueError('Project staging byte budget exceeded')
            result[file.relative_to(self.root).as_posix()] = sha(file.read_bytes())
        return result

    def load(self, change_id, session):
        if not isinstance(change_id, str) or not re.fullmatch(r'[a-f0-9]{32}', change_id):
            raise ValueError('Invalid change-set id')
        record = json.loads((self.directory/change_id/'manifest.json').read_text(encoding='utf-8'))
        if record['project'] != str(self.project) or record['session'] != session:
            raise ValueError('Change set belongs to another project or session')
        return record

    def save(self, record):
        atomic_json(self.directory/record['id']/'manifest.json', record)

    def pending_review(self, session):
        manifests = sorted(self.directory.glob('*/manifest.json'),
                           key=lambda file: file.stat().st_mtime, reverse=True)
        for manifest in manifests:
            try:
                record = self.load(manifest.parent.name, session)
            except (OSError, ValueError, KeyError):
                continue
            if record['status'] != 'validated':
                continue
            self.verify(record)
            diff = []
            size = 0
            changed = [entry for entry in record['files'] if entry['beforeSha256'] != entry['afterSha256']]
            for entry in changed:
                path = entry['path']
                before = self.target(path).read_bytes() if entry['beforeSha256'] is not None else b''
                after = (manifest.parent/'project'/path).read_bytes()
                if sha(after) != entry['afterSha256'] or (entry['beforeSha256'] is not None and sha(before) != entry['beforeSha256']):
                    raise ValueError('Files changed while preparing review. Stage the changes again.')
                for line in difflib.unified_diff(before.decode('utf-8').splitlines(True),
                                                 after.decode('utf-8').splitlines(True),
                                                 fromfile=f'before/{path}', tofile=f'after/{path}'):
                    size += len(line)
                    if size > 120_000:
                        break
                    diff.append(line)
                if size > 120_000:
                    break
            return self.describe(record) | {
                'reviewDiff': ''.join(diff) if size <= 120_000 else None,
                'changedFiles': [entry['path'] for entry in changed],
            }
        return None

    def stage(self, session, request):
        if not self.project.is_file():
            raise ValueError('File change sets require a PBIP project file')
        if not isinstance(session, str) or not session:
            raise ValueError('Session identity required')
        if not isinstance(request, dict) or set(request) != {'planId','summary','files'}:
            raise ValueError('Provide planId, summary and files only')
        if not isinstance(request['planId'], str) or not re.fullmatch(r'[a-f0-9]{32}', request['planId']):
            raise ValueError('Invalid design plan id')
        plan = json.loads((self.directory.parent/f'design-{request["planId"]}.json').read_text(encoding='utf-8'))
        if plan['project'] != str(self.project):
            raise ValueError('Design plan project mismatch')
        if not isinstance(request['summary'], str) or not 1 <= len(request['summary']) <= 2000:
            raise ValueError('Summary needs 1–2000 characters')
        changes = request['files']
        if not isinstance(changes, list) or not 1 <= len(changes) <= 200:
            raise ValueError('Stage 1–200 files')
        with self.lock:
            baseline = self.snapshot()
            normalized = []
            seen = set()
            total = 0
            for item in changes:
                if not isinstance(item, dict) or set(item) != {'path','content','beforeSha256'}:
                    raise ValueError('Each file needs path, content and beforeSha256 (null for a new file)')
                target = self.target(item['path'])
                path = target.relative_to(self.root).as_posix()
                if path.lower() in seen:
                    raise ValueError('Duplicate change target')
                seen.add(path.lower())
                if baseline.get(path) != item['beforeSha256']:
                    raise ValueError('Source checksum changed; read the current file before staging')
                if not isinstance(item['content'], str):
                    raise ValueError('File content must be UTF-8 text')
                data = item['content'].encode('utf-8')
                total += len(data)
                if len(data) > 250000 or total > 1_500_000:
                    raise ValueError('Change content budget exceeded')
                if target.suffix.lower() != '.tmdl':
                    body = json.loads(item['content'])
                    if target == self.project and body.get('artifacts') != json.loads(self.project.read_text(encoding='utf-8-sig')).get('artifacts'):
                        raise ValueError('Changing project report references is not supported')
                    if target.name == 'definition.pbir' and body.get('datasetReference') != json.loads(target.read_text(encoding='utf-8-sig')).get('datasetReference'):
                        raise ValueError('Changing semantic-model references is not supported')
                normalized.append({'path':path,'beforeSha256':item['beforeSha256'], 'afterSha256':sha(data)})
            change_id = uuid4().hex
            folder = self.directory/change_id
            staged = folder/'project'
            staged.mkdir(parents=True)
            for path in baseline:
                target = staged/path
                target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(self.root/path,target)
            diff = []
            for item, entry in zip(changes, normalized):
                destination = staged/entry['path']
                original = destination.read_text(encoding='utf-8-sig') if destination.exists() else ''
                destination.parent.mkdir(parents=True,exist_ok=True)
                destination.write_bytes(item['content'].encode('utf-8'))
                diff.extend(difflib.unified_diff(original.splitlines(True),item['content'].splitlines(True),
                                               fromfile=entry['path'],tofile=entry['path']))
            identity = {'project':str(self.project),'session':session,'planId':request['planId'],
                        'summary':request['summary'],'files':normalized,'baseline':baseline}
            digest = sha(json.dumps(identity,sort_keys=True).encode('utf-8'))
            record = dict(identity,id=change_id,digest=digest,status='staged',validation=None,approval=None)
            self.save(record)
            (folder/'changes.diff').write_text(''.join(diff),encoding='utf-8')
            self.journal.append('change-stage','succeeded',changeSetId=change_id,digest=digest,files=len(normalized))
            return self.describe(record)

    def describe(self, record):
        folder = self.directory/record['id']
        return {key:record[key] for key in ('id','digest','project','planId','summary','files','status','validation','approval')} | {
            'ok':True,'executionScope':'Apply and reload these definitions, then refresh existing model tables and verify row counts without another refresh approval.',
            'diffPath':str(folder/'changes.diff'),'manifestPath':str(folder/'manifest.json'),
            'stagedProject':str(folder/'project'/self.project.name),
            'reloadOutcome':record.get('reloadOutcome')}

    def verify(self, record, baseline=True):
        identity = {key:record[key] for key in ('project','session','planId','summary','files','baseline')}
        if sha(json.dumps(identity,sort_keys=True).encode('utf-8')) != record['digest']:
            raise ValueError('Change manifest checksum mismatch')
        if baseline and self.snapshot() != record['baseline']:
            raise ValueError('Live project changed since staging; approval is stale')
        folder = self.directory/record['id']/'project'
        expected = dict(record['baseline'])
        expected.update({entry['path']:entry['afterSha256'] for entry in record['files']})
        actual = {file.relative_to(folder).as_posix():sha(file.read_bytes()) for file in folder.rglob('*') if file.is_file()}
        if actual != expected:
            raise ValueError('Staged project changed; validate a new change set')
        for entry in record['files']:
            self.target(entry['path'])
            if sha((folder/entry['path']).read_bytes()) != entry['afterSha256']:
                raise ValueError('Staged content changed; approval is stale')

    def validate(self, change_id, session, validator):
        with self.lock:
            record = self.load(change_id,session)
            if record['status'] not in ('staged','validated'):
                raise ValueError('Only an unapplied unapproved change set can be validated')
            self.verify(record)
            result = validator(self.directory/change_id/'project'/self.project.name)
            if not isinstance(result, dict) or result.get('passed') is not True:
                record['validation'] = result
                record['status'] = 'staged'
                self.save(record)
                return self.describe(record)
            record['validation'] = result
            record['status'] = 'validated'
            self.save(record)
            self.journal.append('change-validation','succeeded',changeSetId=change_id,digest=record['digest'])
            return self.describe(record)

    def approve(self, change_id, session, digest, source='native-user-command'):
        if source not in ('native-user-command','task-workflow'):
            raise ValueError('Unknown change authorization source')
        with self.lock:
            record = self.load(change_id,session)
            self.verify(record)
            if record['digest'] != digest or record['status'] != 'validated':
                raise ValueError('Approval requires the exact validated digest')
            record['approval'] = {'digest':digest,'source':source}
            record['status'] = 'approved'
            self.save(record)
            self.journal.append('change-approval','recorded',changeSetId=change_id,digest=digest)
            return self.describe(record)

    def apply(self, change_id, session, digest, preflight):
        with self.lock:
            record = self.load(change_id,session)
            self.verify(record)
            if record['digest'] != digest or record['status'] != 'approved' or record.get('approval') not in ({'digest':digest,'source':'native-user-command'},{'digest':digest,'source':'task-workflow'}):
                raise ValueError('Exact validated change approval or task authorization is required')
            preflight()
            self.verify(record)
            folder = self.directory/change_id
            checkpoint = folder/'checkpoint'
            for entry in record['files']:
                source = self.root/entry['path']
                if source.exists():
                    target = checkpoint/entry['path']
                    target.parent.mkdir(parents=True,exist_ok=True)
                    shutil.copyfile(source,target)
                    if sha(target.read_bytes()) != entry['beforeSha256']:
                        raise ValueError('Source changed while checkpointing')
            record['status'] = 'applying'
            self.save(record)  # Persist before the first external file mutation.
            written = []
            try:
                for entry in record['files']:
                    target = self.target(entry['path'])
                    current = sha(target.read_bytes()) if target.exists() else None
                    if current != entry['beforeSha256']:
                        raise ValueError('Target changed immediately before application')
                    target.parent.mkdir(parents=True,exist_ok=True)
                    mark_external_effect('write-dispatched')
                    atomic_bytes(target,(folder/'project'/entry['path']).read_bytes())
                    written.append(entry)
                record['status'] = 'applied'
                self.save(record)
                self.journal.append('change-apply','succeeded',changeSetId=change_id,digest=digest)
                return self.describe(record)
            except Exception:
                # Restore only our writes, never overwrite a subsequent user change.
                try:
                    for entry in reversed(written):
                        self.restore_entry(record,entry)
                    record['status'] = 'rolled-back'
                except Exception:
                    record['status'] = 'recovery-required'
                    raise
                finally:
                    self.save(record)
                    self.journal.append('change-apply','failed',changeSetId=change_id,recovery=record['status'])
                raise

    def restore_entry(self, record, entry):
        target = self.target(entry['path'])
        if not target.exists() or sha(target.read_bytes()) != entry['afterSha256']:
            raise ValueError('Recovery stopped: target changed after application')
        if entry['beforeSha256'] is None:
            target.unlink()
        else:
            backup = self.directory/record['id']/'checkpoint'/entry['path']
            if sha(backup.read_bytes()) != entry['beforeSha256']:
                raise ValueError('Checkpoint checksum mismatch')
            atomic_bytes(target,backup.read_bytes())

    def rollback(self, change_id, session, digest, preflight):
        with self.lock:
            record = self.load(change_id,session)
            if record['digest'] != digest or record['status'] not in ('applied','applying','recovery-required'):
                raise ValueError('Rollback requires an applied or interrupted change set and exact digest')
            preflight()
            restore = []
            for entry in record['files']:
                target = self.target(entry['path'])
                current = sha(target.read_bytes()) if target.exists() else None
                if current == entry['afterSha256']:
                    restore.append(entry)
                elif current != entry['beforeSha256']:
                    raise ValueError('Rollback blocked: a target was edited after application')
            record['status'] = 'rolling-back'
            self.save(record)
            mark_external_effect('write-dispatched')
            for entry in reversed(restore):
                self.restore_entry(record,entry)
            record['status'] = 'rolled-back'
            self.save(record)
            self.journal.append('change-rollback','succeeded',changeSetId=change_id)
            return self.describe(record) | {'desktopState':'not-restored; inspect before another reload'}
