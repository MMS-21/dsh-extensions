"""Power BI Live Designer MVP: loopback-only Desktop preview for DeepSeek Harness.

Requires the Power BI report authoring CLI package entry or executable.
No external Python packages required. Intended to run on the Windows PC with Desktop.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import threading
import time
import hashlib
import socket
import secrets
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4
from refresh_policy import build_plan
from mcp_adapter import MCPAdapter
from screenshot_check import check_png
from operation_journal import OperationJournal, mark_external_effect
from semantic_inspection import inspect_semantic_model, report_directory
from functools import wraps
from design_planning import save_plan, record_review
from change_sets import ChangeSets
from model_processing import ProcessingPlans, OfficialRefreshAdapter


class BlockedOperation(RuntimeError):
    blocked = True


class CliOperationError(RuntimeError):
    """Safe structured failure context; no CLI output or request values in logs."""
    def __init__(self, label, returncode, payload):
        data = payload.get('data', {}) if isinstance(payload, dict) else {}
        if not isinstance(data, dict):
            data = {}
        diagnostics = data.get('diagnostics', {})
        self.diagnostic_codes = [code for code in diagnostics if isinstance(code, str) and re.fullmatch(r'[A-Z0-9_]{1,80}', code)][:32] if isinstance(diagnostics, dict) else []
        code = _error_code(payload)
        if isinstance(code,str) and re.fullmatch(r'[A-Z0-9_]{1,80}',code) and code not in self.diagnostic_codes:
            self.diagnostic_codes.append(code)
        self.error_count = data.get('errorCount') if isinstance(data.get('errorCount'), int) else None
        self.warning_count = data.get('warningCount') if isinstance(data.get('warningCount'), int) else None
        self.exit_code = returncode
        self.stage = label
        codes = ', '.join(self.diagnostic_codes) or _error_code(payload) or 'no structured diagnostic'
        super().__init__(f'{label} failed (exit={returncode}, errors={self.error_count}, warnings={self.warning_count}; {codes})')


def recorded(operation):
    def decorate(method):
        @wraps(method)
        def call(self, *args, **kwargs):
            action = args[0] if args else kwargs.get('name')
            label = f'desktop:{action}' if operation == 'desktop-action' and action in {'status','validate','attach','reload','capture'} else operation
            if operation == 'change-operation' and action in {'stage','get','validate','approve','apply','rollback','reload'}:
                label = f'change:{action}'
            if operation == 'change-operation' and isinstance(action,str) and action.startswith('processing-'):
                label = action
            return self.journal.run(label, lambda: method(self, *args, **kwargs))
        return call
    return decorate

MAX_POST_BYTES = 65536
ALLOWED_PAGE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$")


def _decode_cli_json(text: str) -> dict | None:
    """Only accept complete JSON; fail closed for status safety checks."""
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        return None
    return value if isinstance(value, dict) else None


def _error_code(payload: dict | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    error = payload.get("error")
    if isinstance(error, dict) and isinstance(error.get("code"), str):
        return error["code"]
    if isinstance(payload.get("code"), str):
        return payload["code"]
    data = payload.get("data")
    if isinstance(data, dict):
        inner = data.get("error")
        if isinstance(inner, dict) and isinstance(inner.get("code"), str):
            return inner["code"]
    return None


class Designer:
    def __init__(self, project: Path, cli: str, runtime: Path, mcp_profile: Path | None = None, enable_uia_save: bool = False, allow_model_writes: bool = False) -> None:
        self.project = project.resolve()
        self.cli = cli
        self.runtime = runtime.resolve()
        self.runtime.mkdir(parents=True, exist_ok=True)
        self.journal = OperationJournal(self.runtime / 'operations.jsonl')
        self.changes = ChangeSets(self.project, self.runtime, self.journal)
        self.modeling_server = None
        self.allow_model_writes = allow_model_writes
        self.image_path = self.runtime / "latest.png"
        self.capture_evidence = None
        self.lock = threading.Lock()
        self.last_action = "none"
        self.last_result = "No commands run yet."
        self.last_at = None
        self.capture_version = 0
        self.mcp_profile = mcp_profile
        self.enable_uia_save = enable_uia_save
        self.refresh_plan = None
        self.refresh_plan_id = None
        self.refresh_phase = "idle"
        self.refresh_review = "not_run"
        self.last_validation = None

    def run(self, arguments: list[str], timeout: int = 120) -> tuple[int, dict | None, str]:
        executable = Path(shutil.which(self.cli) or self.cli)
        if executable.suffix.lower() in ('.cmd', '.ps1'):
            # Execute the installed official CLI through Node, without a shell.
            package = executable.parent / 'node_modules' / '@microsoft' / 'powerbi-report-authoring-cli'
            manifest = json.loads((package / 'package.json').read_text(encoding='utf-8'))
            entry = (package / manifest['bin']['powerbi-report-author']).resolve()
            if not entry.is_relative_to(package.resolve()):
                raise RuntimeError('CLI entry escapes its installed package')
            node = shutil.which('node')
            if not node:
                raise RuntimeError('Node executable is unavailable')
            cmd = [node, str(entry), *arguments]
        elif executable.suffix.lower() in ('.js', '.mjs', '.cjs'):
            node = shutil.which('node')
            if not node:
                raise RuntimeError('Node executable is unavailable')
            cmd = [node, str(executable), *arguments]
        else:
            cmd = [str(executable), *arguments]
        try:
            read_only = arguments[0] == 'validate' or '--status' in arguments or '--list-hosts' in arguments
            mark_external_effect('read-only-dispatched' if read_only else 'write-dispatched')
            proc = subprocess.run(
                cmd, text=True, capture_output=True, timeout=timeout,
                shell=False, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError(f"CLI timed out after {timeout} seconds; outcome unknown, inspect Desktop before retrying") from exc
        except OSError as exc:
            raise RuntimeError(f"Cannot launch CLI: {exc}") from exc
        output = (proc.stdout or "").strip()
        diagnostic = "\n".join(filter(None, [output, (proc.stderr or "").strip()]))
        return proc.returncode, _decode_cli_json(output), diagnostic[:12000]

    @staticmethod
    def require_success(result: tuple[int, dict | None, str], label: str) -> None:
        returncode, payload, message = result
        data = payload.get('data', {}) if isinstance(payload, dict) else {}
        reported_failure = isinstance(data, dict) and (data.get('result') == 'failed' or
            isinstance(data.get('errorCount'), int) and data['errorCount'] > 0)
        if returncode != 0 or (payload is not None and payload.get("ok") is False) or reported_failure:
            raise CliOperationError(label, returncode, payload)

    def preview_arguments(self, *flags: str) -> list[str]:
        return ["preview", str(report_directory(self.project)), "--host", "desktop", *flags]

    def _status_for_mutation(self, *, allow_unavailable_for_attach: bool = False) -> None:
        """Mandatory fail-closed preflight before Desktop attach/reload."""
        result = self.run(self.preview_arguments("--status"), timeout=60)
        code, payload, diagnostic = result
        if (code != 0 or (payload is not None and payload.get("ok") is False)):
            if allow_unavailable_for_attach and _error_code(payload) == "HOST_UNAVAILABLE":
                return
            raise RuntimeError("Desktop status failed; no mutation performed. " + diagnostic)
        # Even exit code 0 is insufficient unless the explicitly documented
        # data.details.hasUnsavedChanges field is present and boolean false.
        data = payload.get("data") if isinstance(payload, dict) else None
        details = data.get("details") if isinstance(data, dict) else None
        unsaved = details.get("hasUnsavedChanges") if isinstance(details, dict) else None
        if unsaved is not False:
            raise RuntimeError(
                "Desktop reload/attach blocked. Status must explicitly say "
                "data.details.hasUnsavedChanges=false. Save/resolve Desktop edits "
                "and check status again. Never force this guard."
            )

    def state(self) -> dict:
        return {
            "project": str(self.project),
            "lastAction": self.last_action,
            "lastResult": self.last_result,
            "lastAt": self.last_at,
            "captureVersion": self.capture_version,
            "hasImage": self.image_path.is_file(),
            "captureEvidence": self.capture_evidence,
            "busy": self.lock.locked(),
            "refreshPlan": self.refresh_plan.to_dict() if self.refresh_plan else None,
            "refreshPlanId": self.refresh_plan_id,
            "refreshPhase": self.refresh_phase,
            "refreshReview": self.refresh_review,
            "modelAdapterConfigured": bool(self.mcp_profile and self.mcp_profile.is_file()),
            "modelWritesEnabled": self.allow_model_writes,
            "lastValidation": self.last_validation,
            "journalPath": str(self.journal.path),
            "capabilities": {"semanticInspection": "local-metadata-only", "liveQueries": False,
                             "modelWrites": self.allow_model_writes,
                             "fileAuthoring":"validated-user-approved-change-sets", "modelDataRefresh":"task-authorized-table-refresh" if self.modeling_server else False},
        }

    @recorded('readiness')
    def readiness(self):
        code, payload, _diagnostic = self.run(self.preview_arguments('--status'), timeout=30)
        available = code == 0 and isinstance(payload, dict) and payload.get('ok') is not False
        details = payload.get('data', {}).get('details', {}) if available else {}
        available = available and isinstance(details, dict) and isinstance(details.get('hasUnsavedChanges'), bool)
        return {'ok': True, 'ready': available and self.project.exists(), 'project': str(self.project),
                'checks': {'serviceReachable': True, 'projectExists': self.project.exists(),
                           'desktopAccessible': available,
                           'unsavedChanges': details.get('hasUnsavedChanges') if isinstance(details, dict) else None},
                'reason': None if available else 'Desktop status unavailable or unrecognized; no changes attempted',
                'state': self.state()}

    @recorded('semantic-inspection')
    def semantic(self):
        return {'ok': True, 'model': inspect_semantic_model(self.project), 'state': self.state()}

    @recorded('project-validation')
    def validation_report(self):
        try:
            self.action('validate')
        except CliOperationError:
            # Validation failure is a useful read result, not a connection failure.
            pass
        return {'ok': True, 'validation': self.last_validation, 'state': self.state()}

    def validate_staged_project(self, project):
        report_result = self.run(['validate',str(project)])
        try:
            self.require_success(report_result,'Staged report validation')
        except CliOperationError as error:
            return {'passed':False,'report':{'errors':error.error_count,'warnings':error.warning_count,
                    'diagnosticCodes':error.diagnostic_codes}}
        payload = report_result[1] or {}
        data = payload.get('data', {})
        if data.get('warningCount',0):
            return {'passed':False,'report':{'warnings':data['warningCount']},
                    'reason':'Resolve incomplete validation coverage before approval'}
        validator = Path(__file__).resolve().parent.parent/'model-validator.mjs'
        node = shutil.which('node')
        if not node or not validator.is_file():
            return {'passed':False,'reason':'Offline Microsoft model validator unavailable'}
        environment = dict(os.environ)
        if self.modeling_server:
            environment['PBI_MODELING_MCP_EXE'] = str(self.modeling_server)
        result = subprocess.run([node,str(validator),str(project)],capture_output=True,text=True,timeout=120,shell=False,env=environment)
        if result.returncode != 0:
            return {'passed':False,'reason':'Microsoft offline model validation failed; review the staged TMDL and EULA setup'}
        try:
            model = json.loads(result.stdout.strip().splitlines()[-1])
        except (ValueError,IndexError):
            return {'passed':False,'reason':'Model validator returned an unrecognized result'}
        return {'passed':model.get('passed') is True,'report':'passed','model':model,
                'runtimeData':'not-processed','visualAppearance':'unverified'}

    @recorded('change-operation')
    def change_operation(self, operation, params):
        session = params.get('sessionId')
        change_id = params.get('id')
        digest = params.get('digest')
        if not self.lock.acquire(blocking=False):
            raise BlockedOperation('Coordinator is busy')
        try:
            if operation.startswith('processing-'):
                processing=ProcessingPlans(self.changes,OfficialRefreshAdapter(self.modeling_server),self._status_for_mutation)
                action=operation.removeprefix('processing-')
                if action=='stage':
                    return processing.stage(session,params.get('value'))
                if action=='get':
                    return processing.describe(processing.load(change_id,session))
                if action=='approve':
                    return processing.approve(change_id,session,digest)
                if action=='run':
                    existing=processing.load(change_id,session)
                    if existing['digest']!=digest:
                        raise ValueError('Exact refresh digest required')
                    if existing['status']=='verified':
                        return self.finish_processing_canvas(processing,existing)
                    result=processing.execute(change_id,session,digest)
                    if result['status']=='verified':
                        return self.finish_processing_canvas(processing,processing.load(change_id,session))
                    return result
                raise ValueError('Unknown processing operation')
            if operation == 'stage':
                return self.changes.stage(session,params.get('value'))
            if operation == 'get':
                return self.changes.describe(self.changes.load(change_id,session))
            if operation == 'pending':
                return {'change': self.changes.pending_review(session)}
            if operation == 'validate':
                return self.changes.validate(change_id,session,self.validate_staged_project)
            if operation == 'authorize':
                return self.changes.approve(change_id,session,digest,source='task-workflow')
            if operation == 'approve':
                return self.changes.approve(change_id,session,digest)
            if operation == 'apply':
                return self.changes.apply(change_id,session,digest,self._status_for_mutation)
            if operation == 'rollback':
                return self.changes.rollback(change_id,session,digest,self._status_for_mutation)
            if operation == 'reload':
                record = self.changes.load(change_id,session)
                if record['digest'] != digest or record['status'] != 'applied':
                    raise BlockedOperation('Reload requires the exact applied change set')
                if record.get('reloadOutcome') == 'unknown':
                    raise BlockedOperation('Previous reload outcome is unknown; inspect Desktop and use file rollback/recovery before creating another change set')
                for entry in record['files']:
                    from change_sets import sha
                    if sha(self.changes.target(entry['path']).read_bytes()) != entry['afterSha256']:
                        raise BlockedOperation('A target changed after application; reload stopped')
                if record.get('reloadOutcome') == 'succeeded':
                    # Replaying model-definition reload can discard already processed rows.
                    self.changes.verify(record,baseline=False)
                    expected=dict(record['baseline'])
                    expected.update({entry['path']:entry['afterSha256'] for entry in record['files']})
                    if self.changes.snapshot()!=expected:
                        raise BlockedOperation('Project changed after reload; stage the actual changes first')
                    return self.changes.describe(record) | {'reloadOutcome':'succeeded','alreadyReloaded':True,
                        'modelDataRefreshed':False,'runtimeDataPreserved':True}
                self.require_success(self.run(['validate',str(self.project)]),'Validation before reload')
                self._status_for_mutation()
                model_changed = any('.SemanticModel/' in entry['path'] for entry in record['files'])
                record['reloadOutcome'] = 'unknown'
                self.changes.save(record)
                self.require_success(self.run(self.preview_arguments('--reload-with-model' if model_changed else '--reload')),'Approved canvas reload')
                record['reloadOutcome'] = 'succeeded'
                self.changes.save(record)
                self.journal.append('change-reload','succeeded',changeSetId=change_id,modelDefinitionsReloaded=model_changed,
                                    modelDataRefreshed=False)
                return self.changes.describe(record) | {'reloadOutcome':'succeeded','modelDataRefreshed':False}
            raise ValueError('Unknown change operation')
        finally:
            self.lock.release()

    def finish_processing_canvas(self, processing, record):
        """Complete a known successful refresh; never reprocess data or reload its definitions."""
        if record.get('canvasReloadOutcome')=='succeeded' and record.get('postCanvasVerification',{}).get('verified') is True:
            return processing.describe(record)
        if record.get('canvasReloadOutcome')=='unknown':
            raise BlockedOperation('Canvas redraw outcome unknown; inspect before retry; data will not be reprocessed')
        identity=record['identity']
        processing.authorization(identity['changeSetId'],identity['session'],identity['changeDigest'])
        if self.changes.snapshot()!=identity['baseline']:
            raise BlockedOperation('Project changed after processing; canvas reload stopped')
        # A refresh makes Desktop dirty. This is our own verified processing,
        # so do not require a false dirty flag or reload model definitions here.
        self.require_success(self.run(self.preview_arguments('--status')),'Exact project check before canvas redraw')
        if record.get('canvasReloadOutcome')!='succeeded':
            record['canvasReloadOutcome']='unknown'
            processing.save(record)
            self.require_success(self.run(self.preview_arguments('--reload')),'Report-only redraw after data refresh')
            record['canvasReloadOutcome']='succeeded'
            processing.save(record)
        checked=processing.adapter.run({'operation':'verify',**{key:identity[key] for key in ('project','tables','checks','target')}},processing.directory)
        record['postCanvasVerification']=checked
        if checked.get('verified') is not True:
            record['status']='verification-failed'
        processing.save(record)
        self.journal.append('processing-canvas','succeeded' if checked.get('verified') else 'failed',
                            refreshId=record['id'],modelDefinitionsReloaded=False,
                            rowsVerifiedAfterRedraw=checked.get('verified') is True)
        return processing.describe(record)

    @recorded('plan')
    def plan_smart_refresh(self, manifest: dict) -> dict:
        # Planning does not invoke Desktop, MCP or UI automation.
        if not self.lock.acquire(blocking=False):
            raise RuntimeError("Another Power BI command is currently running")
        try:
            plan = build_plan(manifest)
            self.refresh_plan = plan
            self.refresh_plan_id = uuid4().hex
            self.refresh_phase = "planned" if plan.executable else "blocked"
            self.refresh_review = "not_run"
            return {"ok": True, "planId": self.refresh_plan_id, "plan": plan.to_dict(), "state": self.state()}
        finally:
            self.lock.release()

    @recorded('design-plan')
    def plan_design(self, brief):
        return save_plan(self.runtime, self.project, brief)

    def review_design(self, review):
        return record_review(self.runtime, self.project, self.journal, review)

    @recorded('refresh')
    def execute_smart_refresh(self, params: dict) -> dict:
        if not self.lock.acquire(blocking=False):
            raise RuntimeError("Another Power BI command is currently running")
        self.last_action = "smart_refresh"
        self.last_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.refresh_review = "not_run"
        try:
            if params.get('planId') != self.refresh_plan_id or self.refresh_plan is None:
                raise RuntimeError("Plan changed or expired; preview a new plan")
            if params.get('approved') is not True:
                raise RuntimeError("Explicit run approval required")
            plan = self.refresh_plan
            if not plan.executable:
                raise RuntimeError("Refresh plan is blocked: " + '; '.join(plan.blocked))
            if not self.allow_model_writes:
                raise BlockedOperation('Model processing is disabled in the read-only inspection milestone')
            # Check every dependency before mutating live Desktop state.
            if (plan.processing or plan.dax_queries) and not (self.mcp_profile and self.mcp_profile.is_file()):
                raise RuntimeError("MCP adapter not configured. Inspect installed MCP tool schemas and configure the profile before running")
            adapter = MCPAdapter(self.mcp_profile) if self.mcp_profile and (plan.processing or plan.dax_queries) else None
            self.refresh_phase = "preflight"
            if plan.reload != 'none':
                validated = self.run(["validate", str(self.project)])
                self.require_success(validated, "Validation before reload")
                self._status_for_mutation()
                self.refresh_phase = "reloading"
                flag = "--reload-with-model" if plan.reload == 'model' else "--reload"
                result = self.run(self.preview_arguments(flag))
                self.require_success(result, "Desktop reload")
            self.refresh_phase = "processing"
            if adapter:
                mark_external_effect('write-dispatched' if plan.processing else 'read-only-dispatched')
            observations = adapter.execute(plan.processing, plan.dax_queries) if adapter else []
            # A successful DAX tool invocation establishes execution only, not
            # numerical correctness. Any expected-value assertions must be checked
            # by a separate agent or a validated extraction profile.
            self.refresh_phase = "capturing"
            for page in (plan.screenshot_pages or ['']):
                self.image_path.unlink(missing_ok=True)
                flags = ["--screenshot", str(self.image_path)]
                if page:
                    if not ALLOWED_PAGE_ID.fullmatch(page):
                        raise RuntimeError("Invalid screenshot page ID")
                    flags.extend(["--page", page])
                result = self.run(self.preview_arguments(*flags))
                self.require_success(result, "Screenshot capture")
                if not self.image_path.is_file() or self.image_path.stat().st_size == 0:
                    raise RuntimeError("Screenshot not created")
                self.record_capture(page,result)
            save_message = "Save the Desktop project after processing, then confirm the unsaved state is clear."
            if self.enable_uia_save and plan.processing and self.project.suffix.lower() == '.pbip':
                from desktop_uia import request_save
                request_save(self.project.stem)
                # UIA only submits Save. Verify it truly happened.
                self._status_for_mutation()
                save_message = "Desktop status explicitly verified no unsaved changes after UIA save."
            self.refresh_phase = "completed_needs_review"
            self.refresh_review = "DAX calls returned without tool errors; inspect values and screenshots before approval"
            self.last_result = f"Smart refresh actions completed. {save_message} Visual and business-value review still required."
            return {"ok": True, "message": self.last_result,
                    "observations": observations, "state": self.state()}
        except Exception as exc:
            self.refresh_phase = "blocked_or_failed"
            self.refresh_review = "not_verified"
            self.last_result = f"ERROR: {exc}"
            raise
        finally:
            self.refresh_plan_id = None
            self.lock.release()

    @recorded('desktop-action')
    def action(self, name: str, params: dict | None = None) -> dict:
        params = params or {}
        if name not in {"status", "validate", "attach", "reload", "capture"}:
            raise ValueError("Unknown action")
        if not self.lock.acquire(blocking=False):
            raise RuntimeError("Another Power BI command is currently running")
        self.last_action = name
        self.last_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            if name == "status":
                result = self.run(self.preview_arguments("--status"), timeout=60)
                self.require_success(result, "Status")
            elif name == "validate":
                result = self.run(["validate", str(self.project)])
                data = result[1].get('data', {}) if isinstance(result[1], dict) else {}
                failure = CliOperationError('Validation', result[0], result[1])
                self.last_validation = {'tool':'powerbi-report-author', 'scope':'authoring-cli',
                    'result':data.get('result', 'unknown') if isinstance(data, dict) else 'unknown',
                    'exitCode':result[0], 'errorCount':failure.error_count,
                    'warningCount':failure.warning_count, 'diagnosticCodes':failure.diagnostic_codes,
                    'desktopCompatibility':'not-established-by-this-check',
                    'schemaCoverage':'incomplete' if any(code in failure.diagnostic_codes for code in ('PBIR_SCHEMA_UNREACHABLE','PBIR_JSON_FILE_NO_SCHEMA')) else 'see-diagnostics'}
                self.require_success(result, "Validation")
            elif name == "attach":
                self._status_for_mutation(allow_unavailable_for_attach=True)
                result = self.run(self.preview_arguments())
                self.require_success(result, "Attach")
            elif name == "reload":
                # Fail before reload if the on-disk PBIR is invalid.
                validated = self.run(["validate", str(self.project)])
                self.require_success(validated, "Validation before reload")
                self._status_for_mutation()
                result = self.run(self.preview_arguments("--reload"))
                self.require_success(result, "Reload")
            else:
                # Warm screenshot capture does not reload Desktop or discard edits.
                page = params.get("page", "")
                if not isinstance(page, str) or (page and not ALLOWED_PAGE_ID.fullmatch(page)):
                    raise ValueError("Page ID must contain only letters, digits, '_' or '-'")
                self.image_path.unlink(missing_ok=True)
                flags = ["--screenshot", str(self.image_path)]
                if page:
                    flags.extend(["--page", page])
                result = self.run(self.preview_arguments(*flags))
                self.require_success(result, "Capture")
                if not self.image_path.is_file() or self.image_path.stat().st_size == 0:
                    raise RuntimeError("CLI returned without creating a non-empty PNG screenshot")
                self.record_capture(page,result)
            _, _, diagnostic = result
            self.last_result = (diagnostic or f"{name} succeeded")[:12000]
            return {"ok": True, "message": self.last_result, "state": self.state()}
        except Exception as exc:
            if name=='capture':
                self.image_path.unlink(missing_ok=True)
                self.capture_evidence={'outcome':'failed','requestedPage':params.get('page',''),
                    'project':str(self.project),'capturedAt':self.last_at,'visualReview':'not-available',
                    'diagnosticCodes':getattr(exc,'diagnostic_codes',[])}
            self.last_result = f"ERROR: {exc}"
            raise
        finally:
            self.lock.release()

    def record_capture(self, page, result):
        check_png(self.image_path)
        payload=result[1]
        data=payload.get('data',payload) if isinstance(payload,dict) else {}
        if not isinstance(data,dict) or data.get('ok',payload.get('ok') if isinstance(payload,dict) else None) is not True:
            raise RuntimeError('Capture has no structured renderer success acknowledgment')
        screenshots=data.get('screenshots',[])
        if page and screenshots and not any(item.get('page')==page for item in screenshots):
            raise RuntimeError('Capture returned a different page; image is not valid evidence')
        if data.get('failures') or data.get('status')=='partial':
            raise RuntimeError('Capture reported rendering failures; image is not valid evidence')
        image_hash=hashlib.sha256(self.image_path.read_bytes()).hexdigest()
        previous=self.capture_evidence or {}
        duplicate_other_page=previous.get('sha256')==image_hash and previous.get('requestedPage')!=page
        self.capture_evidence={'outcome':'succeeded','requestedPage':page,'sha256':image_hash,
            'capturedAt':self.last_at,'project':str(self.project),'rendererAcknowledged':True,
            'pageIdentityVerified':bool(page and screenshots),'visualReview':'pending',
            'freshness':'unverified-duplicate-across-pages' if duplicate_other_page else 'warm-window-snapshot',
            'warning':'Capture does not establish that the open window reflects on-disk edits.'}
        self.capture_version += 1
        self.journal.append('capture-evidence','succeeded',**{key:value for key,value in self.capture_evidence.items() if key!='outcome'})


class Handler(BaseHTTPRequestHandler):
    designer: Designer
    allowed_hosts: set[str]
    allowed_origins: set[str]
    control_token: str = ''

    def _headers(self, code: int, content_type: str, length: int) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'none'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
        )
        self.end_headers()

    def _write(self, code: int, data: bytes, content_type: str) -> None:
        self._headers(code, content_type, len(data))
        self.wfile.write(data)

    def _json(self, code: int, data: dict) -> None:
        self._write(code, json.dumps(data).encode("utf-8"), "application/json; charset=utf-8")

    def _check_host(self) -> bool:
        if self.headers.get("Host", "") not in self.allowed_hosts:
            self._json(403, {"ok": False, "error": "Unrecognized Host header"})
            return False
        return True

    def do_GET(self) -> None:
        if not self._check_host():
            return
        route = urlparse(self.path).path
        if route == "/api/state":
            self._json(200, {"ok": True, "state": self.designer.state()})
        elif route == "/api/image":
            if self.designer.image_path.is_file():
                self._write(200, self.designer.image_path.read_bytes(), "image/png")
            else:
                self._json(404, {"ok": False, "error": "No screenshot captured yet"})
        elif route == '/api/journal':
            self._json(200, {'ok': True, 'entries': self.designer.journal.tail(),
                             'journalPath': str(self.designer.journal.path)})
        else:
            self._json(404, {"ok": False, "error": "Unknown route"})

    def _discard_small_body(self):
        # Drain bounded rejected requests so Windows can deliver the 403 instead of a TCP reset.
        try:
            length=int(self.headers.get('Content-Length','0'))
            if 0 < length <= MAX_POST_BYTES:
                self.connection.settimeout(2)
                self.rfile.read(length)
        except (ValueError,OSError):
            pass

    def do_POST(self) -> None:
        if not self._check_host():
            return
        origin = self.headers.get("Origin", "")
        if origin and origin not in self.allowed_origins:
            self._json(403, {"ok": False, "error": "Cross-origin operation blocked"})
            return
        if self.headers.get("X-PBI-Live-Designer") != "1":
            self._json(403, {"ok": False, "error": "Missing local UI action header"})
            return
        route = urlparse(self.path).path
        action = route.removeprefix("/api/")
        if route in {'/api/attach','/api/reload','/api/refresh/run'}:
            self._discard_small_body()
            self._json(403,{'ok':False,'error':'Legacy mutation routes are disabled. Use an exact user-approved change set.'})
            return
        if route.startswith('/api/changes/'):
            supplied = self.headers.get('Authorization','').removeprefix('Bearer ')
            if not self.control_token or not secrets.compare_digest(supplied,self.control_token):
                self._discard_small_body()
                self._json(403,{'ok':False,'error':'Authenticated host control channel required'})
                return
            try:
                length = int(self.headers.get('Content-Length','0'))
                if not 0 < length <= 2_000_000:
                    raise ValueError('Invalid change request size')
                params = json.loads(self.rfile.read(length))
                if not isinstance(params,dict):
                    raise ValueError('Expected object')
                result = self.designer.change_operation(route.rsplit('/',1)[-1],params)
                self._json(200,{'ok':True,**result})
            except (ValueError,RuntimeError,FileNotFoundError) as error:
                self._json(409,{'ok':False,'error':str(error)})
            except Exception:
                self._json(500,{'ok':False,'error':'Change operation failed; inspect checkpoint and journal before retry'})
            return
        if route not in {"/api/status", "/api/validate", "/api/attach", "/api/reload", "/api/capture", "/api/refresh/plan", "/api/refresh/run", '/api/readiness', '/api/semantic', '/api/design/plan', '/api/design/review', '/api/validation'}:
            self._json(404, {"ok": False, "error": "Unknown action"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > MAX_POST_BYTES:
                raise ValueError("Request body too large")
            params = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(params, dict):
                raise ValueError("Expected JSON object")
            if route == '/api/design/plan':
                result = self.designer.plan_design(params)
            elif route == '/api/design/review':
                result = self.designer.review_design(params)
            elif route == '/api/readiness':
                result = self.designer.readiness()
            elif route == '/api/semantic':
                result = self.designer.semantic()
            elif route == '/api/validation':
                result = self.designer.validation_report()
            elif route == "/api/refresh/plan":
                result = self.designer.plan_smart_refresh(params)
            elif route == "/api/refresh/run":
                result = self.designer.execute_smart_refresh(params)
            else:
                result = self.designer.action(action, params)
            self._json(200, result)
        except (ValueError, RuntimeError) as exc:
            self._json(409, {"ok": False, "error": str(exc), "state": self.designer.state()})
        except Exception:
            self._json(500, {"ok": False, "error": "Unexpected server error"})

    def log_message(self, fmt: str, *args) -> None:
        # Avoid logging private request paths or report details by default.
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Local Power BI preview inside DeepSeek Harness")
    parser.add_argument("--project", required=True, help="Existing .pbip file or .Report directory")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--cli", default="powerbi-report-author", help="CLI executable name or path")
    parser.add_argument("--mcp-profile", default=None, help="Operator-verified MCP operation map JSON")
    parser.add_argument("--enable-uia-save", action="store_true", help="Opt in to Windows UI Automation Save with status verification")
    parser.add_argument('--allow-model-writes', action='store_true', help='Explicitly opt in to legacy processing; disabled by default')
    parser.add_argument('--control-token-file', help='Private authenticated host-control token file')
    parser.add_argument('--modeling-server', help='Official Microsoft modeling executable for offline validation and approved table refresh')
    args = parser.parse_args()
    project = Path(args.project).expanduser()
    if not project.exists() or not (project.suffix.lower() == ".pbip" or project.is_dir() and project.name.endswith(".Report")):
        parser.error("--project must be an existing .pbip file or .Report folder")
    if not (1024 <= args.port <= 65535):
        parser.error("--port must be between 1024 and 65535")
    if shutil.which(args.cli) is None and not Path(args.cli).is_file():
        parser.error("powerbi-report-author was not found. Install @microsoft/powerbi-report-authoring-cli")

    runtime_key = hashlib.sha256(str(project.resolve()).encode('utf-8')).hexdigest()[:16]
    designer = Designer(project, args.cli, Path(__file__).resolve().parent / '.runtime' / runtime_key,
                        Path(args.mcp_profile).resolve() if args.mcp_profile else None, args.enable_uia_save, args.allow_model_writes)
    designer.modeling_server = args.modeling_server
    class LocalHandler(Handler):
        pass
    LocalHandler.designer = designer
    LocalHandler.allowed_hosts = {f"127.0.0.1:{args.port}", f"localhost:{args.port}"}
    LocalHandler.allowed_origins = {f"http://127.0.0.1:{args.port}", f"http://localhost:{args.port}"}
    if args.control_token_file:
        LocalHandler.control_token = Path(args.control_token_file).read_text(encoding='utf-8-sig').strip()
    class LocalServer(ThreadingHTTPServer):
        # On Windows, address reuse can attach two unrelated servers to one port.
        allow_reuse_address = False

        def server_bind(self):
            if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()

    server = LocalServer(("127.0.0.1", args.port), LocalHandler)
    print(f"Power BI Live Designer: http://127.0.0.1:{args.port}", flush=True)
    print(f"Project: {designer.project}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
