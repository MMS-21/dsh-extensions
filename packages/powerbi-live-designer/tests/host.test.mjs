/**
 * Offline host tests for the Power BI Live Designer bundle.
 *
 * Runs the real apply() against a mocked Cordis context and a mock loopback
 * coordinator, so the HTTP operation surface, the per-Session binding, the
 * approval gate and the agent tools are exercised without Power BI Desktop.
 *
 * Run: node --test tests/host.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import {registerDesignSkills} from '../skills.js';
import {existsSync} from 'node:fs';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/F8sAAAAASUVORK5CYII=',
  'base64'
);

async function startCoordinator() {
  const calls = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, body, hasControlAuth:req.headers.authorization==='Bearer '+'a'.repeat(64) });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url === '/api/state') {
        res.end(JSON.stringify({
          ok: true,
          state: {
            project: 'C:\\BI\\Sales\\Sales.pbip',
            lastAction: 'none',
            lastResult: 'No commands run yet.',
            refreshPhase: 'idle',
            captureVersion: 0,
            hasImage: false,
            modelAdapterConfigured: false,
            modelWritesEnabled: true,
          },
        }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/readiness') {
        res.end(JSON.stringify({ok:true,ready:true,project:'C:\\BI\\Sales\\Sales.pbip',checks:{projectExists:true,desktopAccessible:true},state:{project:'C:\\BI\\Sales\\Sales.pbip'}}));
        return;
      }
      if (req.method === 'POST' && ['/api/changes/approve','/api/changes/processing-approve'].includes(req.url)) {
        if(req.headers.authorization!=='Bearer '+'a'.repeat(64)){res.statusCode=403;res.end('{"ok":false}');return;}
        res.end('{"ok":true,"status":"approved"}');return;
      }
      if(req.method==='POST' && ['/api/changes/stage','/api/changes/processing-stage'].includes(req.url)) {
        res.end(JSON.stringify({ok:true,status:req.url.endsWith('processing-stage')?'ready':'staged'}));return;
      }
      if (req.method === 'POST' && req.url === '/api/refresh/plan') {
        const manifest = JSON.parse(body || '{}');
        if (!Array.isArray(manifest.changes) || manifest.changes.length === 0) {
          res.statusCode = 409;
          res.end(JSON.stringify({ ok: false, error: 'Provide at least one explicit change declaration' }));
          return;
        }
        res.end(JSON.stringify({
          ok: true,
          planId: 'plan-1',
          plan: { reload: 'none', processing: [{ type: 'Full', target: 'table', table: 'FactSales' }] },
          state: { refreshPhase: 'planned' },
        }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/refresh/run') {
        const parsed = JSON.parse(body || '{}');
        if (parsed.planId !== 'plan-1') {
          res.statusCode = 409;
          res.end(JSON.stringify({ ok: false, error: 'Plan changed or expired; preview a new plan' }));
          return;
        }
        res.end(JSON.stringify({
          ok: true,
          message: 'Smart refresh actions completed.',
          observations: [{ tool: 'mapped', ok: true }],
          state: { refreshPhase: 'completed_needs_review' },
        }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/capture') {
        res.end(JSON.stringify({ ok: true, message: 'Screenshot captured.', state: { captureVersion: 1, hasImage: true } }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/image') {
        res.setHeader('content-type', 'image/png');
        res.end(PNG_1PX);
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    calls,
    url: `http://127.0.0.1:${port}`,
    async close() { await new Promise((resolve) => server.close(resolve)); },
  };
}

function setup(config = {allowModelWrites:true}, liveAgents = [{id:'session-1'}], commands) {
  const routes = new Map();
  const tools = new Map();
  const workspace = mkdtempSync(join(tmpdir(), 'pbi-live-designer-'));
  const ctx = {
    tools: {
      register(definition) {
        assert.equal(typeof definition.execute, 'function', `tool ${definition.name} needs execute`);
        tools.set(definition.name, definition);
        return () => tools.delete(definition.name);
      },
    },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route);
          return () => routes.delete(route.path);
        },
      },
    },
    agents: { list: () => liveAgents },
    inject(names, callback) {
      if(commands && names.includes('commands'))callback({commands:{register(command){commands.set(command.name,command);return()=>commands.delete(command.name);}},effect:fn=>fn()});
    },
    effect(callback) { return callback(); },
    get(name) {
      if (name === 'workingDirectory') return { get: () => workspace };
      return undefined;
    },
  };
  apply(ctx, config);
  return { routes, tools, workspace };
}

async function post(route, body) {
  const request = new Request(`http://127.0.0.1${route.path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await route.fetch(request);
  return { status: response.status, body: await response.json() };
}

const MANIFEST = {
  refreshPolicy: 'smart',
  refreshScope: 'affected',
  verifyDax: true,
  verifyScreenshots: true,
  changes: [{ kind: 'source_data', tables: ['FactSales'], storage: 'Import', lineageVerified: true }],
  daxQueries: ['EVALUATE ROW("SalesRows", COUNTROWS(\'FactSales\'))'],
  screenshotPages: [],
};

test('configure binds the session and status returns coordinator state', async (t) => {
  const coordinator = await startCoordinator();
  t.after(() => coordinator.close());
  const { routes } = setup();
  const configure = routes.get('/api/pbi-live-designer/configure');
  const status = routes.get('/api/pbi-live-designer/status');

  const bound = await post(configure, { sessionId: 'session-1', serviceUrl: coordinator.url });
  assert.equal(bound.status, 200);
  assert.equal(bound.body.serviceUrl, coordinator.url);
  assert.equal(bound.body.ok, true);

  const result = await post(status, { sessionId: 'session-1' });
  assert.equal(result.status, 200);
  assert.equal(result.body.state.refreshPhase, 'idle');
  assert.equal(result.body.state.project, 'C:\\BI\\Sales\\Sales.pbip');
  assert.deepEqual(coordinator.calls.at(-1), { method: 'GET', url: '/api/state', body: '', hasControlAuth:false });
});

test('failed connection does not report success or replace a verified binding', async t => {
  const coordinator = await startCoordinator();
  t.after(() => coordinator.close());
  const {routes} = setup();
  const configure = routes.get('/api/pbi-live-designer/configure');
  await post(configure, {sessionId:'session-1',serviceUrl:coordinator.url});
  const mismatch = await post(configure, {sessionId:'session-1',serviceUrl:coordinator.url,project:'C:\\Other.pbip'});
  assert.equal(mismatch.status, 409);
  assert.match(mismatch.body.error, /does not match/);
  const status = await post(routes.get('/api/pbi-live-designer/status'), {sessionId:'session-1'});
  assert.equal(status.body.project, 'C:\\BI\\Sales\\Sales.pbip');
});

test('non-loopback service and PBIX paths fail before HTTP dispatch', async () => {
  const {routes} = setup();
  for (const serviceUrl of ['https://example.com','http://127.0.0.1/path','http://user:secret@localhost:8765']) {
    const result = await post(routes.get('/api/pbi-live-designer/configure'), {sessionId:'session-1',serviceUrl});
    assert.equal(result.status, 409);
  }
  const pbix = await post(routes.get('/api/pbi-live-designer/configure'), {sessionId:'session-1',project:'C:\\HR.pbix'});
  assert.match(pbix.body.error, /separate PBIP/);
});

test('no live agents fails closed', async () => {
  const {routes} = setup({}, []);
  const result = await post(routes.get('/api/pbi-live-designer/status'), {sessionId:'session-1'});
  assert.equal(result.status, 409);
});

test('model writes are disabled by default even with approved=true', async () => {
  const {tools} = setup({});
  await assert.rejects(tools.get('pbi_run_approved_refresh').execute({approved:true,planId:'plan-1'},
    {agent:{id:'session-1'}}), /disabled/);
});

test('offline operation journal is readable when coordinator is unavailable', async () => {
  const {tools} = setup({serviceUrl:'http://127.0.0.1:1'});
  const result = await tools.get('pbi_get_operation_log').execute({}, {agent:{id:'session-1'}});
  assert.equal(result.coordinatorAvailable, false);
  assert.ok(result.hostEntries.some(entry => entry.outcome === 'failed'));
});

test('bundled skills register native resource directories and dispose', () => {
  const registered = new Map();
  const dispose = registerDesignSkills({register(skill){registered.set(skill.name,skill);return ()=>registered.delete(skill.name);}});
  assert.equal(registered.size, 4);
  const router = registered.get('analysis-report-workflow');
  assert.ok(router.content.includes('dashboard-design-process'));
  assert.ok(existsSync(router.resourceBase.path + '/references/powerbi.md'));
  const patterns = registered.get('dashboard-design-patterns');
  assert.ok(existsSync(patterns.resourceBase.path + '/references/design-baseline.md'));
  dispose();
  assert.equal(registered.size, 0);
});

test('model sees complete closed nested proposal and review schemas', () => {
  const {tools} = setup();
  const brief = tools.get('pbi_plan_design').parameters.properties.value;
  assert.equal(brief.additionalProperties,false);
  assert.ok(brief.required.includes('questions'));
  const page = brief.properties.pages.items;
  const visual = page.properties.visuals.items;
  assert.equal(page.additionalProperties,false);
  assert.equal(visual.additionalProperties,false);
  assert.deepEqual(visual.required,['question','measure','dimension','acceptance']);
  assert.equal(visual.properties.binding,undefined);
  const review = tools.get('pbi_record_review').parameters.properties.value;
  assert.equal(review.additionalProperties,false);
  assert.deepEqual(review.properties.source.enum,['user-feedback','agent-finding']);
  assert.equal(review.properties.planId.pattern,'^[a-f0-9]{32}$');
  assert.match(tools.get('pbi_validate_project').description,/separate from Desktop readiness/);
});

test('approval exists only on the native user command and uses the private control channel', async t => {
  const coordinator=await startCoordinator();t.after(()=>coordinator.close());
  const directory=mkdtempSync(join(tmpdir(),'pbi-auth-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const {writeFileSync}=await import('node:fs');
  const tokenFile=join(directory,'token');writeFileSync(tokenFile,'a'.repeat(64));
  const commands=new Map();
  const {tools,routes}=setup({serviceUrl:coordinator.url,controlTokenFile:tokenFile},[{id:'session-1'}],commands);
  assert.equal(tools.has('pbi_approve_changes'),false);
  assert.equal(routes.has('/api/pbi-live-designer/change-approve'),false);
  assert.equal(routes.has('/api/pbi-live-designer/change-rollback'),false);
  const result=await commands.get('pbi').handler({agent:{session:{id:'session-1'}},rawInput:'approve '+'b'.repeat(32)+' '+'c'.repeat(64)});
  assert.equal(result.kind,'success');
  const call=coordinator.calls.find(value=>value.url==='/api/changes/approve');
  assert.equal(call.hasControlAuth,true);
  assert.equal(JSON.parse(call.body).sessionId,'session-1');
  assert.match(tools.get('pbi_stage_model_refresh').description,/without another user approval/);
  assert.match(tools.get('pbi_run_model_refresh').description,/No separate refresh-approval command/);
  assert.equal(tools.has('pbi_approve_model_refresh'),false);
  assert.equal(routes.has('/api/pbi-live-designer/change-processing-approve'),false);
  for(const name of ['pbi_stage_model_refresh','pbi_get_model_refresh','pbi_run_model_refresh'])assert.ok(tools.has(name));
  const approved=await commands.get('pbi').handler({agent:{session:{id:'session-1'}},rawInput:'refresh-approve '+'b'.repeat(32)+' '+'c'.repeat(64)});
  assert.equal(approved.kind,'success');
  const refresh=coordinator.calls.find(value=>value.url==='/api/changes/processing-approve');
  assert.equal(refresh.hasControlAuth,true);
  assert.equal(JSON.parse(refresh.body).sessionId,'session-1');
});

test('plan stores a pending plan and run requires explicit approval', async (t) => {
  const coordinator = await startCoordinator();
  t.after(() => coordinator.close());
  const { routes } = setup();
  await post(routes.get('/api/pbi-live-designer/configure'), { sessionId: 'session-1', serviceUrl: coordinator.url });

  const planned = await post(routes.get('/api/pbi-live-designer/plan'), { sessionId: 'session-1', manifest: MANIFEST });
  assert.equal(planned.status, 200);
  assert.equal(planned.body.planId, 'plan-1');
  assert.equal(planned.body.plan.processing[0].table, 'FactSales');

  const refused = await post(routes.get('/api/pbi-live-designer/run'), { sessionId: 'session-1', planId: 'plan-1' });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /approval/i);

  const wrongPlan = await post(routes.get('/api/pbi-live-designer/run'), { sessionId: 'session-1', planId: 'plan-2', approved: true });
  assert.equal(wrongPlan.status, 409);
  assert.match(wrongPlan.body.error, /expired/i);
});

test('an approved run executes once and clears the pending plan', async (t) => {
  const coordinator = await startCoordinator();
  t.after(() => coordinator.close());
  const { routes } = setup();
  await post(routes.get('/api/pbi-live-designer/configure'), { sessionId: 'session-1', serviceUrl: coordinator.url });
  await post(routes.get('/api/pbi-live-designer/plan'), { sessionId: 'session-1', manifest: MANIFEST });

  const run = await post(routes.get('/api/pbi-live-designer/run'), { sessionId: 'session-1', planId: 'plan-1', approved: true });
  assert.equal(run.status, 200);
  assert.equal(run.body.message, 'Smart refresh actions completed.');
  assert.deepEqual(run.body.observations, [{ tool: 'mapped', ok: true }]);
  assert.equal(run.body.state.refreshPhase, 'completed_needs_review');
  assert.ok(coordinator.calls.some((call) => call.url === '/api/refresh/run'));

  const again = await post(routes.get('/api/pbi-live-designer/run'), { sessionId: 'session-1', planId: 'plan-1', approved: true });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /No reviewed refresh plan/);
});

test('abort clears a pending plan and capture validates the page id', async (t) => {
  const coordinator = await startCoordinator();
  t.after(() => coordinator.close());
  const { routes } = setup();
  await post(routes.get('/api/pbi-live-designer/configure'), { sessionId: 'session-1', serviceUrl: coordinator.url });
  await post(routes.get('/api/pbi-live-designer/plan'), { sessionId: 'session-1', manifest: MANIFEST });

  const aborted = await post(routes.get('/api/pbi-live-designer/abort'), { sessionId: 'session-1' });
  assert.equal(aborted.status, 200);
  assert.equal(aborted.body.aborted, true);
  assert.equal(aborted.body.cleared, true);

  const badPage = await post(routes.get('/api/pbi-live-designer/capture'), { sessionId: 'session-1', page: '--reload' });
  assert.equal(badPage.status, 409);
  assert.match(badPage.body.error, /Page id/);

  const captured = await post(routes.get('/api/pbi-live-designer/capture'), { sessionId: 'session-1', page: '' });
  assert.equal(captured.status, 200);
  assert.equal(captured.body.state.captureVersion, 1);
});

test('artifact streams the latest PNG and rejects an unknown session', async (t) => {
  const coordinator = await startCoordinator();
  t.after(() => coordinator.close());
  const { routes } = setup();
  await post(routes.get('/api/pbi-live-designer/configure'), { sessionId: 'session-1', serviceUrl: coordinator.url });

  const artifact = routes.get('/api/pbi-live-designer/artifact');
  const ok = await artifact.fetch(new Request(`http://127.0.0.1${artifact.path}?sessionId=session-1`));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /^image\/png/);
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG_1PX);

  const missing = await artifact.fetch(new Request(`http://127.0.0.1${artifact.path}?sessionId=other`));
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /not live|Session/);
});

test('the agent tools share the same gate and write the screenshot artifact', async (t) => {
  const coordinator = await startCoordinator();
  t.after(() => coordinator.close());
  const { tools, workspace } = setup();
  const exec = { agent: { id: 'session-1' } };

  await tools.get('pbi_configure').execute({ serviceUrl: coordinator.url, project: 'C:\\BI\\Sales\\Sales.pbip' }, exec);
  const status = await tools.get('pbi_get_status').execute({}, exec);
  assert.equal(status.state.refreshPhase, 'idle');

  const planned = await tools.get('pbi_plan_refresh').execute({ manifest: MANIFEST }, exec);
  assert.equal(planned.planId, 'plan-1');

  await assert.rejects(
    () => tools.get('pbi_run_approved_refresh').execute({ planId: 'plan-1', approved: false }, exec),
    /approval/i
  );

  await tools.get('pbi_capture_page').execute({ page: '' }, exec);
  const artifact = await tools.get('pbi_get_artifact').execute({}, exec);
  assert.equal(artifact.structuralCheck, 'passed');
  assert.equal(artifact.width, 1);
  assert.equal(artifact.height, 1);
  const saved = await readFile(artifact.path);
  assert.deepEqual(saved, PNG_1PX);

  await assert.rejects(
    () => tools.get('pbi_get_status').execute({}, { agent: { id: 'not-live' } }),
    /not live/
  );

  await rm(workspace, { recursive: true, force: true });
});

test('staging tools preserve the coordinator value envelope and server-owned session',async t=>{
 const coordinator=await startCoordinator();t.after(()=>coordinator.close());
 const directory=mkdtempSync(join(tmpdir(),'pbi-stage-envelope-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const {writeFileSync}=await import('node:fs');const tokenFile=join(directory,'token');writeFileSync(tokenFile,'a'.repeat(64));
 const {tools}=setup({serviceUrl:coordinator.url,controlTokenFile:tokenFile},[{id:'session-1'}]);
 const exec={agent:{id:'session-1'}};
 for(const [name,path,value] of [
  ['pbi_stage_changes','stage',{planId:'b'.repeat(32),summary:'Fixture',files:[]}],
  ['pbi_stage_model_refresh','processing-stage',{changeSetId:'b'.repeat(32),tables:['Fixture'],checks:[],sourceFiles:[],sourceSummary:'Fixture'}]
 ]){
  await tools.get(name).execute({value},exec);
  const call=coordinator.calls.find(x=>x.url==='/api/changes/'+path);
  assert.deepEqual(JSON.parse(call.body),{value,sessionId:'session-1'});
  assert.equal(call.hasControlAuth,true);
 }
});
