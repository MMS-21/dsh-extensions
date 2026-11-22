/**
 * Host half of @local/dsh-plugin-powerbi-live-designer.
 *
 * Drives the local Power BI coordinator service (py-service/server.py) that
 * owns the Microsoft report-authoring CLI, the Desktop status safety check and
 * the guarded smart-refresh planner. This plugin adds:
 *
 *   - one HTTP operation surface under /api/pbi-live-designer/*, registered on
 *     the authenticated DSH connection channel so the browser tab can call it;
 *   - the six typed agent tools pbi_plan_refresh, pbi_run_approved_refresh,
 *     pbi_get_status, pbi_capture_page, pbi_get_artifact and pbi_abort_if_safe,
 *     plus pbi_configure for the per-session binding;
 *   - the per-session project/service binding and the explicit approval gate,
 *     enforced here in the Host rather than only in the browser.
 *
 * For direct table refreshes the Host connects to Microsoft's Modeling MCP
 * over stdio. File authoring still uses the loopback coordinator.
 */

import {jsonTool} from './tool-json.mjs';
import {registerDesignSkills} from './skills.js';
import {designBriefSchema, reviewFindingSchema} from './design-contracts.js';
import {appendFileSync, mkdirSync, openSync, readSync, closeSync, fstatSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {win32, resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {listModelTables, refreshModelTables, validateRefreshTables,verifyScalar,queryModel} from './direct-model.mjs';
import {TaskStore} from './task-store.mjs';
import {Workflow} from './workflow.mjs';
import {prepareProject} from './prepare-project.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {projectSnapshot} from './project-snapshot.mjs';
import {saveVerifiedProject} from './save-project.mjs';

export const name = 'powerbi-live-designer';
export const inject = ['tools', 'connection', 'agents'];

const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8765';
const STATUS_TIMEOUT_MS = 30000;
const ACTION_TIMEOUT_MS = 120000;
const RUN_TIMEOUT_MS = 900000;
const ARTIFACT_DIR = '.pbi-live-designer';
const ACTIONS = ['task-status', 'task-performance', 'configure', 'direct-connect', 'direct-refresh', 'status', 'readiness', 'semantic', 'validation', 'journal', 'design-plan', 'design-review', 'plan', 'run', 'capture', 'abort', 'change-stage','change-get','change-pending','change-validate','change-apply','change-reload'];
const PAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

function readString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function jsonResponse(value, status = 200) {
  return Response.json(value, { status });
}

function summarizeActivity(entries) {
  const operations = new Map();
  for (const entry of entries) {
    const operation = operations.get(entry.operationId);
    operations.set(entry.operationId, {
      operation:entry.operation,
      startedAt:operation?.startedAt ?? (['started','dispatch'].includes(entry.outcome) ? entry.at : null),
      outcome:entry.outcome,
      lastEventAt:entry.at,
    });
  }
  const outcomes = {};
  let tablesRefreshed = 0;
  for (const entry of entries) {
    if (entry.operation === 'direct-refresh' && entry.outcome === 'refreshed') tablesRefreshed++;
  }
  const rows = [...operations.values()].map(({operation, startedAt, outcome, lastEventAt}) => {
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    return {operation, startedAt, lastEventAt, outcome,
      observedDurationMs:startedAt ? Date.parse(lastEventAt) - Date.parse(startedAt) : null};
  });
  return {eventCount:entries.length, operationCount:rows.length, outcomes, tablesRefreshed, operations:rows};
}

function pngSize(bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('latin1') !== '\x89PNG\r\n\x1a\n') {
    return { width: null, height: null };
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function apply(ctx, config) {
  const configuredServiceUrl = readString(config?.serviceUrl) ?? DEFAULT_SERVICE_URL;
  const configuredProject = readString(config?.project) ?? null;

  /** sessionId -> { serviceUrl, project } */
  const bindings = new Map();
  const directProjects = new Map();
  const tasks = new Map();
  /** sessionId -> { planId, plan, manifest, createdAt } */
  const pending = new Map();
  /** sessionIds with a coordinator operation in flight */
  const running = new Set();

  const agents = ctx.agents;
  const logDirectory = fileURLToPath(new URL('./.runtime/', import.meta.url));
  const logPath = resolve(logDirectory, 'host-operations.jsonl');
  const taskStore = new TaskStore(config?.taskDirectory ?? resolve(logDirectory,'tasks'));
  const workflow = new Workflow(taskStore,{
    normalize:value=>win32.normalize(value).toLowerCase(),
    prepare:input=>prepareProject(input),
    resume:async task=>prepareProject({project:task.project,mode:task.mode,resume:true}),
    async bind(task){
      if(task.connection&&task.connection.protocol!=='task-tools-v2'){const upgraded=await prepareProject({project:task.project,mode:task.mode,resume:true});task.connection=upgraded.connection;task.capabilities=upgraded.capabilities;taskStore.write(currentWorkflowSession(),task);}
      tasks.set(currentWorkflowSession(),{mode:task.mode==='new'?'new':'existing',project:task.project,startedAt:task.createdAt});
      bindings.set(currentWorkflowSession(),{...task.connection,project:task.project});
    },
    inspect:()=>dispatch('semantic',{sessionId:currentWorkflowSession()}),
    plan:value=>dispatch('design-plan',{sessionId:currentWorkflowSession(),value}),
    stage:value=>changeCall(currentWorkflowSession(),'stage',value),
    validate:value=>changeCall(currentWorkflowSession(),'validate',value),
    get:value=>changeCall(currentWorkflowSession(),'get',value),
    authorize:value=>changeCall(currentWorkflowSession(),'authorize',value),
    apply:value=>changeCall(currentWorkflowSession(),'apply',value),
    reload:value=>changeCall(currentWorkflowSession(),'reload',value),
    stageRefresh:value=>changeCall(currentWorkflowSession(),'processing-stage',value),
    getRefresh:value=>changeCall(currentWorkflowSession(),'processing-get',value),
    refresh:value=>changeCall(currentWorkflowSession(),'processing-run',value),
    query:(task,check)=>verifyScalar(task.project,check),
    async refreshData(task,tables){await connectDirect(currentWorkflowSession(),task.project);return refreshDirect(currentWorkflowSession(),tables);},
    readiness:()=>dispatch('readiness',{sessionId:currentWorkflowSession()}),
    snapshot:task=>projectSnapshot(task.project),
    save:task=>saveVerifiedProject(task.project,task.verificationSnapshot),
    async capture(task,page){
      const result=await opCapture(currentWorkflowSession(),page);
      const evidence=result.state?.captureEvidence;
      if(!evidence?.rendererAcknowledged||evidence.pageIdentityVerified!==true||evidence.freshness==='unverified-duplicate-across-pages')throw Error('Capture did not verify the requested page.');
      const {bytes}=await fetchArtifact(currentWorkflowSession());
      const hash=createHash('sha256').update(bytes).digest('hex');
      if(hash!==evidence.sha256)throw Error('Screenshot changed while collecting evidence.');
      const directory=resolve(taskStore.folder(currentWorkflowSession()),'artifacts');mkdirSync(directory,{recursive:true});
      const path=resolve(directory,hash+'.png');writeFileSync(path,bytes);
      return {...evidence,path};
    },
  });
  // AsyncLocalStorage prevents concurrent chats from sharing adapter identity.
  const workflowSession = new AsyncLocalStorage();
  function currentWorkflowSession(){const session=workflowSession.getStore();if(!session)throw Error('Missing workflow session');return session;}
  function record(operation, outcome, id, errorType, sessionId, table) {
    mkdirSync(logDirectory, {recursive: true});
    appendFileSync(logPath, JSON.stringify({at: new Date().toISOString(), operation,
      outcome, operationId: id, sessionId, ...(errorType ? {errorType} : {}), ...(table ? {table} : {})}) + '\n');
  }
  function hostEntries(sessionId) {
    let fd;
    try {
      fd = openSync(logPath, 'r');
      const size = fstatSync(fd).size;
      const bytes = Buffer.alloc(Math.min(size, 256000));
      readSync(fd, bytes, 0, bytes.length, Math.max(0, size - bytes.length));
      const lines = bytes.toString('utf8').trim().split('\n');
      if (size > bytes.length) lines.shift();
      return lines.flatMap(line => {try {return [JSON.parse(line)];} catch {return [];}})
        .filter(entry => entry.sessionId === sessionId).slice(-50);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    } finally { if (fd !== undefined) closeSync(fd); }
  }

  function taskEntries(sessionId, task) {
    return hostEntries(sessionId).filter(entry =>
      entry.at >= task.startedAt && !/\/(state|status|readiness|journal|pending)$/.test(entry.operation));
  }
  function checkedUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Use an HTTP loopback origin without credentials, path, query or fragment');
    }
    return url.origin;
  }
  function sameProject(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const normalize = value => /^[A-Za-z]:[\\/]/.test(value) ? win32.normalize(value).toLowerCase() : resolve(value);
    return normalize(a) === normalize(b);
  }
  function verifyProject(binding, payload) {
    const actual = payload?.state?.project ?? payload?.project;
    if (!actual || (binding.project && !sameProject(binding.project, actual))) {
      throw new Error('The report editing connection does not match the requested project. Select the requested report before continuing.');
    }
    return actual;
  }
  ctx.inject?.(['skills'], scoped => scoped.effect(() => registerDesignSkills(scoped.skills)));
  ctx.inject?.(['commands'], scoped => scoped.effect(() => scoped.commands.register({
    name:'pbi',description:'Review, approve, or roll back an exact Power BI change set. Approval is user-command only.',
    input:{hint:'review ID | approve ID SHA256 | rollback ID SHA256 | refresh-review ID | refresh-approve ID SHA256'},
    async handler({agent,rawInput}) {
      const match=/^(review|approve|rollback|refresh-review|refresh-approve)\s+([a-f0-9]{32})(?:\s+([a-f0-9]{64}))?$/.exec(rawInput.trim());
      if(!match)return {kind:'error',text:'Use /pbi review ID, /pbi approve ID SHA256, /pbi rollback ID SHA256, /pbi refresh-review ID, or /pbi refresh-approve ID SHA256.'};
      try {
        const sessionId=requireSession(agent?.session?.id??agent?.id);
        const result=await changeCall(sessionId,({'review':'get','refresh-review':'processing-get','refresh-approve':'processing-approve'}[match[1]]??match[1]),{id:match[2],digest:match[3]});
        return {kind:'success',text:JSON.stringify(result)};
      } catch(error) {return {kind:'error',text:error.message};}
    }
  })));

  function requireSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') {
      throw new Error('A live Session is required for Power BI Live Designer');
    }
    const live = typeof agents?.list === 'function' ? agents.list() : [];
    if (!live.some((agent) => (agent.session?.id ?? agent.id) === sessionId)) {
      throw new Error('The requesting Session is not live');
    }
    return sessionId;
  }

  function bindingFor(sessionId) {
    let binding = bindings.get(sessionId);
    if (binding === undefined) {
      const saved=taskStore.read(sessionId);
      binding = saved?.connection ? {...saved.connection,project:saved.project} : { serviceUrl: configuredServiceUrl, project: configuredProject };
      bindings.set(sessionId, binding);
    }
    return binding;
  }

  function requireTaskProject(sessionId, project) {
    const task = tasks.get(sessionId);
    if (!task) return;
    if (!task.project) throw Error('Paste and confirm the saved .pbip path first.');
    if (!sameProject(task.project, project)) throw Error('Use the confirmed .pbip for this chat.');
  }

  function baseUrl(binding) {
    return binding.serviceUrl.replace(/\/+$/, '');
  }

  /**
   * Call one loopback coordinator operation. The service is the only place
   * that talks to the Microsoft CLI, so this plugin never guesses a Desktop
   * capability: a failure here is surfaced verbatim.
   */
  async function serviceCall(sessionId, { method, path, body, timeoutMs }, candidate) {
    const binding = candidate ?? bindingFor(sessionId);
    requireTaskProject(sessionId, binding.project);
    const operationId = randomUUID();
    record(path, 'started', operationId, undefined, sessionId);
    const headers = { 'X-PBI-Live-Designer': '1' };
    if(path.startsWith('/api/changes/')) {
      const tokenFile=binding.controlTokenFile??config?.controlTokenFile;
      if(typeof tokenFile!=='string')throw new Error('Authenticated authoring control channel is not configured');
      const token=readFileSync(tokenFile,'utf8').trim();
      if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid authoring control token');
      headers.authorization='Bearer '+token;
    }
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response;
    try {
      response = await fetch(checkedUrl(binding.serviceUrl) + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs ?? ACTION_TIMEOUT_MS),
        redirect: 'error',
      });
    } catch (error) {
      record(path, error.name === 'TimeoutError' ? 'unknown' : 'failed', operationId, error.name, sessionId);
      throw new Error(`Cannot reach the local Power BI service at ${baseUrl(binding)}: ${error.message}`);
    }
    const text = await response.text();
    let payload;
    try {
      payload = text === '' ? {} : JSON.parse(text);
    } catch {
      payload = { ok: false, error: 'The local Power BI service returned a non-JSON response', detail: text.slice(0, 400) };
    }
    if (!response.ok || payload.ok === false) {
      record(path, 'failed', operationId, 'CoordinatorError', sessionId);
      throw new Error(payload.error ?? `The local Power BI service responded with HTTP ${response.status}`);
    }
    record(path, payload.ready === false ? 'blocked' : 'succeeded', operationId, undefined, sessionId);
    return payload;
  }

  async function fetchArtifact(sessionId) {
    const binding = bindingFor(sessionId);
    let response;
    try {
      response = await fetch(checkedUrl(binding.serviceUrl) + '/api/image', {
        headers: { 'X-PBI-Live-Designer': '1' },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
        redirect: 'error',
      });
    } catch (error) {
      throw new Error(`Cannot reach the local Power BI service at ${baseUrl(binding)}: ${error.message}`);
    }
    if (!response.ok) {
      throw new Error(response.status === 404 ? 'No screenshot has been captured yet' : `Screenshot request failed with HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8_000_000 || pngSize(bytes).width === null) throw new Error('Invalid or oversized PNG screenshot');
    return { bytes, contentType: response.headers.get('content-type') ?? 'image/png' };
  }

  function stateOf(payload) {
    return payload?.state ?? null;
  }

  async function opConfigure(sessionId, { serviceUrl, project } = {}) {
    if (running.has(sessionId)) throw new Error('Wait for the current operation before changing connection');
    const binding = {...bindingFor(sessionId)};
    const nextServiceUrl = readString(serviceUrl);
    const nextProject = readString(project) ?? tasks.get(sessionId)?.project;
    if (nextProject?.toLowerCase().endsWith('.pbix')) {
      throw new Error('PBIX is not a PBIP project. Save a separate PBIP copy from Desktop; keep the original PBIX');
    }
    if (nextServiceUrl !== undefined) binding.serviceUrl = checkedUrl(nextServiceUrl);
    if (nextProject !== undefined) binding.project = nextProject;
    const payload = await serviceCall(sessionId, {method:'POST', path:'/api/readiness', body:{}, timeoutMs:STATUS_TIMEOUT_MS}, binding);
    binding.project = verifyProject(binding, payload);
    binding.readiness = payload;
    bindings.set(sessionId, binding);
    pending.delete(sessionId);
    return {ok:true, sessionId, serviceUrl:binding.serviceUrl, project:binding.project,
      ready:payload.ready === true && payload.checks?.projectExists === true,
      readiness:payload, state:stateOf(payload), hostJournalPath:logPath};
  }

  async function opStatus(sessionId) {
    const binding = bindingFor(sessionId);
    const payload = await serviceCall(sessionId, { method: 'GET', path: '/api/state', timeoutMs: STATUS_TIMEOUT_MS });
    verifyProject(binding, payload);
    return {
      ok: true,
      sessionId,
      serviceUrl: binding.serviceUrl,
      project: binding.project,
      state: stateOf(payload),
      readiness: binding.readiness ?? null,
      hostJournalPath: logPath,
    };
  }

  async function opPlan(sessionId, manifest) {
    if (running.has(sessionId)) throw new Error('Another Power BI operation is already running for this Session');
    await opStatus(sessionId);
    const payload = await serviceCall(sessionId, {
      method: 'POST', path: '/api/refresh/plan', body: manifest, timeoutMs: ACTION_TIMEOUT_MS,
    });
    if (typeof payload?.planId !== 'string' || payload.planId === '') {
      throw new Error('The local service did not return a plan id');
    }
    pending.set(sessionId, {
      planId: payload.planId,
      plan: payload.plan ?? null,
      manifest,
      createdAt: new Date().toISOString(),
    });
    return {
      ok: true,
      planId: payload.planId,
      plan: payload.plan ?? null,
      state: stateOf(payload),
    };
  }

  async function opRun(sessionId, planId) {
    if (config?.allowModelWrites !== true) throw new Error('Model processing is disabled in this read-only milestone');
    if (running.has(sessionId)) throw new Error('Another Power BI operation is already running for this Session');
    const record = pending.get(sessionId);
    if (record === undefined) throw new Error('No reviewed refresh plan is pending; build a plan first');
    if (planId !== undefined && planId !== record.planId) throw new Error('The plan changed or expired; build a new plan');
    running.add(sessionId);
    try {
      const payload = await serviceCall(sessionId, {
        method: 'POST', path: '/api/refresh/run', body: { planId: record.planId, approved: true }, timeoutMs: RUN_TIMEOUT_MS,
      });
      pending.delete(sessionId);
      return {
        ok: true,
        message: payload.message ?? 'Smart refresh actions completed.',
        observations: Array.isArray(payload.observations) ? payload.observations : [],
        state: stateOf(payload),
      };
    } finally {
      running.delete(sessionId);
    }
  }

  async function opCapture(sessionId, page) {
    if (running.has(sessionId)) throw new Error('Another Power BI operation is already running for this Session');
    await opStatus(sessionId);
    if (page !== '' && !PAGE_ID.test(page)) throw new Error('Page id must contain only letters, digits, "_" or "-"');
    running.add(sessionId);
    try {
      const payload = await serviceCall(sessionId, {
        method: 'POST', path: '/api/capture', body: { page }, timeoutMs: ACTION_TIMEOUT_MS,
      });
      return { ok: true, message: payload.message ?? 'Screenshot captured.', state: stateOf(payload) };
    } finally {
      running.delete(sessionId);
    }
  }

  async function opAbort(sessionId) {
    if (running.has(sessionId)) {
      return { ok: true, aborted: false, cleared: false, reason: 'An operation is running; the coordinator owns the cancellation policy and was not interrupted' };
    }
    const cleared = pending.delete(sessionId);
    return { ok: true, aborted: true, cleared, reason: cleared ? 'Pending plan cleared' : 'Nothing to abort' };
  }

  async function dispatch(op, body) {
    const sessionId = requireSession(body?.sessionId);
    if(op.startsWith('change-'))return changeCall(sessionId,op.slice(7),body?.value??{});
    switch (op) {
      case 'task-status': {
        const durable=taskStore.read(sessionId);
        if(durable)return {ok:true,task:{...workflow.status(sessionId).task,latest:taskEntries(sessionId,{startedAt:durable.createdAt}).at(-1)??null}};
        const task = tasks.get(sessionId);
        if (!task) {
          const editing = bindings.get(sessionId);
          const project = directProjects.get(sessionId) ?? (editing?.readiness ? editing.project : null);
          return {ok:true, task:project ? {project, latest:null} : null};
        }
        const project = task.project ?? null;
        const entries = taskEntries(sessionId, task);
        return {ok:true, task:{...task, project, latest:entries.at(-1) ?? null}};
      }
      case 'task-performance': {
        const task = tasks.get(sessionId);
        return {ok:true, activity:summarizeActivity(taskEntries(sessionId, task ?? {startedAt:''}))};
      }
      case 'direct-connect':
        return connectDirect(sessionId, body.project);
      case 'direct-refresh':
        if (!readString(body.project)) throw Error('The refresh must identify the connected project.');
        return {ok:true, refresh:await refreshDirect(sessionId, body.tables, body.project)};
      case 'configure':
        return await opConfigure(sessionId, body);
      case 'status':
        return await opStatus(sessionId);
      case 'readiness':
        return await opConfigure(sessionId);
      case 'semantic':
        await opStatus(sessionId);
        return await serviceCall(sessionId, {method:'POST', path:'/api/semantic', body:{}});
      case 'validation':
        await opStatus(sessionId);
        return await serviceCall(sessionId, {method:'POST', path:'/api/validation', body:{}});
      case 'journal':
        try {
          await opStatus(sessionId);
          return {...await serviceCall(sessionId, {method:'GET', path:'/api/journal'}),
            hostJournalPath:logPath, hostEntries:hostEntries(sessionId)};
        } catch (error) {
          return {ok:true, entries:[], coordinatorAvailable:false, error:error.message,
            hostJournalPath:logPath, hostEntries:hostEntries(sessionId)};
        }
      case 'design-plan':
      case 'design-review':
        await opStatus(sessionId);
        return await serviceCall(sessionId, {method:'POST',
          path:op === 'design-plan' ? '/api/design/plan' : '/api/design/review', body:body.value});
      case 'plan': {
        const manifest = body?.manifest;
        if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
          throw new Error('manifest must be a reviewed change-manifest object');
        }
        return await opPlan(sessionId, manifest);
      }
      case 'run': {
        if (body?.approved !== true) throw new Error('Explicit approval is required: approved must be true');
        return await opRun(sessionId, body?.planId);
      }
      case 'capture':
        return await opCapture(sessionId, typeof body?.page === 'string' ? body.page : '');
      case 'abort':
        return await opAbort(sessionId);
      default:
        throw new Error(`Unknown Power BI Live Designer operation ${String(op)}`);
    }
  }

  async function connectDirect(sessionId, project) {
    requireTaskProject(sessionId, project);
    if (typeof project !== 'string' || !win32.isAbsolute(project) || !project.toLowerCase().endsWith('.pbip')
        || !statSync(project, {throwIfNoEntry:false})?.isFile()) {
      throw Error('Choose the full path of the .pbip project open in Power BI Desktop.');
    }
    const tables = await listModelTables(project);
    directProjects.set(sessionId, project);
    return {ok:true, project, tables};
  }

  async function refreshDirect(sessionId, tables, expectedProject, signal) {
    validateRefreshTables(tables);
    const project = directProjects.get(sessionId);
    requireTaskProject(sessionId, project);
    if (!project || (expectedProject && !sameProject(project, expectedProject))) {
      throw Error('Connect to this open Power BI project in the current chat before refreshing.');
    }
    const id = randomUUID();
    return refreshModelTables({
      project, tables, signal, journalDir:resolve(logDirectory, 'direct-refresh'),
      record:(outcome, table) => record('direct-refresh', outcome, id, undefined, sessionId, table),
    });
  }

  async function changeCall(sessionId, operation, value) {
    await opStatus(sessionId);
    const payload=['stage','processing-stage'].includes(operation)?{value}:value;
    return serviceCall(sessionId,{method:'POST',path:'/api/changes/'+operation,
      body:{...payload,sessionId},timeoutMs:RUN_TIMEOUT_MS});
  }

  async function handleAction(op, request) {
    const contentType = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      return jsonResponse({ ok: false, error: 'content type must be application/json' }, 415);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'body is not JSON' }, 400);
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: 'body must be a JSON object' }, 400);
    }
    try {
      return jsonResponse(await dispatch(op, body));
    } catch (error) {
      return jsonResponse({ ok: false, error: error.message }, 409);
    }
  }

  async function handleArtifact(request) {
    const sessionId = new URL(request.url).searchParams.get('sessionId') ?? '';
    try {
      requireSession(sessionId);
      const { bytes, contentType } = await fetchArtifact(sessionId);
      return new Response(new Uint8Array(bytes), {
        headers: {
          'content-type': contentType,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      return jsonResponse({ ok: false, error: error.message }, 404);
    }
  }

  const toolOutput = {
    schema: { type: 'object' },
    render(_args, value) {
      return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
    },
  };

  function toolSession(exec) {
    return requireSession(exec?.agent?.session?.id ?? exec?.agent?.id);
  }

  const simpleTools = new Set(['pbi_prepare_task','pbi_inspect_task','pbi_prepare_draft','pbi_execute_task','pbi_task_status']);
  function registerTool(definition) {
    if(config?.advancedTools !== true && !simpleTools.has(definition.name))return () => {};
    return ctx.tools.register(jsonTool(definition));
  }

  /** Register the HTTP operations and the agent tools under this plugin's effect. */
  ctx.effect(() => {
    const disposers = [];
    disposers.push(registerTool({
      name:'pbi_start_task',
      description:'Open Power BI Live Designer at task start. Call with the mode before asking for the saved PBIP path, then again with the same mode and the path provided by the user.',
      parameters:{type:'object',additionalProperties:false,required:['mode'],properties:{
        mode:{enum:['new','existing']},savePolicy:{enum:['automatic','manual']},project:{type:'string'},
      }},
      output:toolOutput,
      execute(args, exec) {
        const sessionId = toolSession(exec);
        const task = tasks.get(sessionId);
        const project = args.project?.trim();
        if (project && (!win32.isAbsolute(project) || !project.toLowerCase().endsWith('.pbip')
            || !statSync(project, {throwIfNoEntry:false})?.isFile())) {
          throw Error('Paste the full path of a saved .pbip file.');
        }
        if (task && (task.mode !== args.mode || (task.project && project && !sameProject(task.project, project)))) {
          throw Error('Open a new DSH chat to start a task for a different Power BI project.');
        }
        const next = task ?? {mode:args.mode, startedAt:new Date().toISOString()};
        if (project) next.project = project;
        tasks.set(sessionId, next);
        return {ok:true, ...next, instruction:next.project ? 'Continue with this confirmed project.' :
          args.mode === 'new' ? 'Open Power BI Desktop, save a new Power BI Project (.pbip), and paste its full path here.' :
          'Open your existing .pbip in Power BI Desktop and paste its full path here.'};
      },
    }));
    disposers.push(registerTool({
      name:'pbi_connect_open_report',
      description:'Connect directly to the exact open Power BI Desktop .pbip project and list its model tables.',
      parameters:{type:'object',additionalProperties:false,required:['project'],properties:{project:{type:'string'}}},
      output:toolOutput,
      execute:(args, exec) => connectDirect(toolSession(exec), args.project),
    }));
    disposers.push(registerTool({
      name:'pbi_refresh_data',
      description:'Refresh only the named tables in the connected open Power BI project when the user explicitly requests a data refresh. Verify row counts and report outcomes. Use this for existing reports; no file change set, reload, or screenshot is needed.',
      parameters:{type:'object',additionalProperties:false,required:['tables'],properties:{
        tables:{type:'array',minItems:1,maxItems:20,uniqueItems:true,items:{type:'string',minLength:1,maxLength:200}},
      }},
      output:toolOutput,
      execute:(args, exec) => refreshDirect(toolSession(exec), args.tables, undefined, exec.signal),
    }));
    const changeId={type:'string',pattern:'^[a-f0-9]{32}$'};
    const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
    const stageValue={type:'object',additionalProperties:false,required:['planId','summary','files'],properties:{
      planId:changeId,summary:{type:'string',minLength:1,maxLength:2000},
      files:{type:'array',minItems:1,maxItems:200,items:{type:'object',additionalProperties:false,
        required:['path','content','beforeSha256'],properties:{path:{type:'string',minLength:1,maxLength:500},
          content:{type:'string',maxLength:250000},beforeSha256:{anyOf:[digest,{type:'null'}]}}}}}};
    const processingValue={type:'object',additionalProperties:false,required:['changeSetId','tables','checks','sourceFiles','sourceSummary'],properties:{
      changeSetId:changeId,tables:{type:'array',minItems:1,maxItems:20,items:{type:'string',minLength:1,maxLength:200}},
      checks:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,required:['table','minRows','maxRows'],properties:{table:{type:'string'},minRows:{type:'integer',minimum:0},maxRows:{type:'integer',minimum:0,maximum:9007199254740991}}}},
      sourceFiles:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:['path','sha256'],properties:{path:{type:'string'},sha256:digest}}},sourceSummary:{type:'string',minLength:1,maxLength:2000}}};
    const scalarCheck={type:'object',additionalProperties:false,required:['query','expected'],properties:{query:{type:'string',maxLength:12000},expected:{type:'number'},tolerance:{type:'number',minimum:0}}};
    const taskTools=[
      ['pbi_prepare_task','Prepare or resume a durable Power BI task. Automatically discover the exact project and start the coordinator. For new reports provide outputDirectory and reportName. Preserve bundled dashboard design skills. Never accepts credentials, EULA acceptance or approval.',{type:'object',additionalProperties:false,required:['intent'],properties:{intent:{type:'string',maxLength:4000},mode:{enum:['new','existing']},savePolicy:{enum:['automatic','manual']},project:{type:'string'},outputDirectory:{type:'string'},reportName:{type:'string'},sources:{type:'array',maxItems:50,items:{type:'string',maxLength:2000}}}},(session,args)=>workflow.prepare(session,args)],
      ['pbi_inspect_task','Inspect semantic metadata or execute a bounded read-only EVALUATE query against the exact prepared project. Query rows are not persisted in task journals. Define numerical acceptance checks in the draft.',{type:'object',additionalProperties:false,properties:{query:{type:'string',maxLength:12000},maxRows:{type:'integer',minimum:1,maximum:100}}},async(session,args)=>args.query?queryModel(workflow.required(session).project,args.query,args.maxRows??100):workflow.inspect(session)],
      ['pbi_prepare_draft','Persist a design plan, stage explicit agent-authored files and validate them in one operation. Follow all four bundled design skills first. Returns the exact validated draft; continue with pbi_execute_task without a sidebar or separate approval.',{type:'object',additionalProperties:false,required:['plan','changes','pages','acceptance'],properties:{revisionOf:digest,plan:designBriefSchema,changes:{type:'object',additionalProperties:false,required:['summary','files'],properties:{summary:stageValue.properties.summary,files:stageValue.properties.files}},pages:{type:'array',minItems:1,maxItems:50,uniqueItems:true,items:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'}},acceptance:{type:'array',minItems:1,maxItems:50,items:{type:'string',minLength:1,maxLength:1000}},checks:{type:'array',maxItems:20,items:scalarCheck},refresh:{type:'object',additionalProperties:false,required:['tables','checks','sourceFiles','sourceSummary'],properties:Object.fromEntries(Object.entries(processingValue.properties).filter(([key])=>key!=='changeSetId'))}}},(session,args)=>workflow.draft(session,args)],
      ['pbi_execute_task','Execute the exact validated draft under the user-requested task: checkpoint, apply, reload, affected-table processing, scalar checks and page captures. Resume acknowledged stages without repeating imports. For an explicit data-only refresh use action=refresh_data with named tables, without a draft. After reading each screenshot, call with action=finish and its page/hash/notes review. Finish saves through the exact-PID helper when available and permitted by savePolicy; otherwise it returns awaiting_save.',{type:'object',additionalProperties:false,properties:{action:{enum:['execute','finish','refresh_data']},tables:{type:'array',minItems:1,maxItems:20,uniqueItems:true,items:{type:'string'}},reviews:{type:'array',maxItems:50,items:{type:'object',additionalProperties:false,required:['page','sha256','passed','notes'],properties:{page:{type:'string'},sha256:digest,passed:{type:'boolean'},notes:{type:'string',minLength:1,maxLength:2000}}}}}},(session,args)=>args.action==='finish'?workflow.finish(session,args.reviews??[]):args.action==='refresh_data'?workflow.refreshData(session,args.tables):workflow.execute(session)],
      ['pbi_task_status','Read durable task context, current steps, evidence and next action after interruption. This never approves, retries, refreshes, reloads or marks work complete.',{type:'object',additionalProperties:false,properties:{}},session=>workflow.status(session)],
    ];
    for(const [name,description,parameters,run] of taskTools)disposers.push(registerTool({name,description,parameters,output:toolOutput,execute:(args,exec)=>{
      const session=toolSession(exec);return workflowSession.run(session,()=>run(session,args));
    }}));
    for(const [name,operation,description,schema] of [
      ['pbi_stage_model_refresh','processing-stage','Stage affected-table Full refresh after approved definitions were applied and reloaded. Fingerprint live model and local source files, specify expected row-count ranges. No data refresh yet. Inherit authorization from the applied change set; continue directly to pbi_run_model_refresh without another user approval. File rollback cannot restore refreshed rows.',processingValue],
      ['pbi_get_model_refresh','processing-get','Inspect persistent refresh outcome, completed tables and row-count evidence. Unknown/running outcomes must not be retried.',{type:'object',additionalProperties:false,required:['id'],properties:{id:changeId}}],
      ['pbi_run_model_refresh','processing-run','Run exact staged refresh within the parent approved change set. No separate refresh-approval command is required. Refuse changed model/project/source fingerprints; refresh only named tables and verify row counts. No automatic retry or full-model fallback. Row counts do not prove metric correctness.',{type:'object',additionalProperties:false,required:['id','digest'],properties:{id:changeId,digest}}],
      ['pbi_stage_changes','stage','Stage DSH-authored report/model definition text against a saved design plan. No live file changes. Return digest and reviewable diff. File approval also covers routine refresh of the applied unchanged model/source definitions; no second refresh approval. Generic authoring only; never infer file approval.',stageValue],
      ['pbi_get_change_set','get','Read an exact staged change set, validation, approval and diff location.',{type:'object',additionalProperties:false,required:['id'],properties:{id:changeId}}],
      ['pbi_validate_changes','validate','Validate staged PBIR and deserialize staged TMDL. When actual edits pass validation, continue with pbi_execute_task in chat. For unchanged files and a data-only request, use pbi_connect_open_report and pbi_refresh_data.',{type:'object',additionalProperties:false,required:['id'],properties:{id:changeId}}],
      ['pbi_apply_changes','apply','Apply an exact validated change set after task workflow authorization. Creates a checkpoint; refuses stale files. No automatic model processing.',{type:'object',additionalProperties:false,required:['id','digest'],properties:{id:changeId,digest}}],
      ['pbi_reload_changes','reload','Reload exact applied report/model definitions into the matching Desktop canvas after unsaved-state checks. Does not refresh model data. A timeout is unknown; inspect before retrying.',{type:'object',additionalProperties:false,required:['id','digest'],properties:{id:changeId,digest}}],
    ]) disposers.push(registerTool({name,description,
      parameters:{type:'object',additionalProperties:false,required:['value'],properties:{value:schema}},
      output:toolOutput,execute:(args,exec)=>changeCall(toolSession(exec),operation,args?.value??{})}));
    for (const [name, operation, description] of [
      ['pbi_check_connection', 'readiness', 'Verify the report editing connection, exact project identity and Desktop status without modifying the report.'],
      ['pbi_inspect_semantic_model', 'semantic', 'Read local semantic metadata only. No DAX, M, row reads or model changes. Surface partial inventory warnings and ask about missing business definitions.'],
      ['pbi_validate_project', 'validation', 'Read the authoring CLI validation result, diagnostic codes and schema-coverage limitations. This is separate from Desktop readiness and never reloads or edits files.'],
      ['pbi_get_operation_log', 'journal', 'Read recent operation outcomes and persistent journal locations. Unknown outcomes need inspection before retry.'],
    ]) disposers.push(registerTool({name, description,
      parameters:{type:'object',additionalProperties:false,properties:{}}, output:toolOutput,
      execute:(_args, exec) => dispatch(operation, {sessionId:toolSession(exec)})}));
    for (const [name, operation, description, valueSchema] of [
      ['pbi_plan_design', 'design-plan', 'Persist a design proposal only, without changing the report. Follow the exact value schema; place proposed bindings in measure/dimension and unresolved decisions in assumptions. Do not add binding or other undeclared keys. Review grain, entity overlap, units, time aggregation, denominators and missing-data handling before saving.', designBriefSchema],
      ['pbi_record_review', 'design-review', 'Record user feedback or an agent finding; never grants execution approval. Follow the exact value schema. Keep credentials and private row data out.', reviewFindingSchema],
    ]) disposers.push(registerTool({name, description,
      parameters:{type:'object',additionalProperties:false,required:['value'],properties:{value:valueSchema}},
      output:toolOutput, execute:(args, exec) => dispatch(operation, {sessionId:toolSession(exec),value:args?.value})}));
    for (const op of ACTIONS) {
      disposers.push(ctx.connection.fetch.register({
        path: `/api/pbi-live-designer/${op}`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handleAction(op, request),
      }));
    }
    disposers.push(ctx.connection.fetch.register({
      path: '/api/pbi-live-designer/artifact',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request) => handleArtifact(request),
    }));

    disposers.push(registerTool({
      name: 'pbi_configure',
      description: 'Bind the confirmed .pbip project for report file editing in this session. For data-only refresh, use pbi_connect_open_report instead. No Desktop change.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          serviceUrl: { type: 'string', description: 'Configured local report editing address, for example http://127.0.0.1:8765.' },
          project: { type: 'string', description: 'Absolute path of the target .pbip project.' },
        },
      },
      output: toolOutput,
      async execute(args, exec) {
        return await opConfigure(toolSession(exec), args ?? {});
      },
    }));

    disposers.push(registerTool({
      name: 'pbi_get_status',
      description: 'Read the Power BI Live Designer report editing state for this Session: bound project, last action, refresh phase, pending plan and whether the model adapter is configured. No Desktop change.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: toolOutput,
      async execute(_args, exec) {
        return await opStatus(toolSession(exec));
      },
    }));

    disposers.push(registerTool({
      name: 'pbi_plan_refresh',
      description: 'Build a deterministic smart affected-table refresh plan from an explicit, reviewed change manifest. Planning never changes Desktop state. Returns the one-time planId that pbi_run_approved_refresh requires.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['manifest'],
        properties: {
          manifest: {
            type: 'object',
            description: 'Reviewed change manifest: refreshPolicy, refreshScope, verifyDax, verifyScreenshots, changes[], daxQueries[], screenshotPages[] and tmdlValidated when model files changed.',
          },
        },
      },
      output: toolOutput,
      async execute(args, exec) {
        const manifest = args?.manifest;
        if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
          throw new Error('manifest must be a reviewed change-manifest object');
        }
        return await opPlan(toolSession(exec), manifest);
      },
    }));

    disposers.push(registerTool({
      name: 'pbi_run_approved_refresh',
      description: 'Execute a previously reviewed pbi_plan_refresh plan for this Session. Requires approved=true and the unchanged planId. May reload PBIR/TMDL, process the model, run DAX checks and capture report screenshots in the local Power BI Desktop.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['planId', 'approved'],
        properties: {
          planId: { type: 'string', description: 'The planId returned by pbi_plan_refresh.' },
          approved: { type: 'boolean', description: 'Must be true after the plan was explicitly reviewed.' },
        },
      },
      output: toolOutput,
      async execute(args, exec) {
        if (args?.approved !== true) throw new Error('Explicit approval is required: pass approved=true after reviewing the plan');
        return await opRun(toolSession(exec), args?.planId);
      },
    }));

    disposers.push(registerTool({
      name: 'pbi_capture_page',
      description: 'Capture a Power BI Desktop report page screenshot and store it as a Session artifact. Capturing does not reload definitions and never discards unsaved Desktop edits.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          page: { type: 'string', description: 'Optional report page id; omit it to capture the current page.' },
        },
      },
      output: toolOutput,
      async execute(args, exec) {
        return await opCapture(toolSession(exec), typeof args?.page === 'string' ? args.page : '');
      },
    }));

    disposers.push(registerTool({
      name: 'pbi_get_artifact',
      description: 'Save the latest captured Power BI screenshot into the Session workspace and return its file path plus image metadata, so it can be read and visually reviewed. Returns no image bytes.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: toolOutput,
      async execute(_args, exec) {
        const sessionId = toolSession(exec);
        const { bytes } = await fetchArtifact(sessionId);
        const workspace = ctx.get('workingDirectory');
        const agent = agents.get?.(sessionId) ?? agents.list().find(a => (a.session?.id ?? a.id) === sessionId);
        const root = typeof workspace?.get === 'function' ? workspace.get(agent?.session ?? sessionId) : undefined;
        if (typeof root !== 'string' || root === '') {
          throw new Error('No Session workspace is available for the screenshot artifact');
        }
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const directory = path.join(root, ARTIFACT_DIR);
        await fs.mkdir(directory, { recursive: true });
        const file = path.join(directory, `capture-${Date.now()}.png`);
        await fs.writeFile(file, bytes);
        const size = pngSize(bytes);
        return {
          ok: true,
          path: file,
          bytes: bytes.length,
          width: size.width,
          height: size.height,
          structuralCheck: 'passed',
          visualReview: 'pending',
        };
      },
    }));

    disposers.push(registerTool({
      name: 'pbi_abort_if_safe',
      description: 'Clear a pending, not-yet-running Power BI refresh plan for this Session. Reports not-safe while an operation is running and never forces a running Desktop operation to stop.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: toolOutput,
      async execute(_args, exec) {
        return await opAbort(toolSession(exec));
      },
    }));

    return () => {
      for (const dispose of disposers) {
        try {
          const result = dispose();
          if (result !== undefined && typeof result.then === 'function') result.catch(() => {});
        } catch {
          /* one failed disposal must not block the others */
        }
      }
    };
  }, 'powerbi-live-designer: http operations and agent tools');
}
