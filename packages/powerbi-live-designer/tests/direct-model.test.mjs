import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {refreshModelTables} from '../direct-model.mjs';

const text = data => ({content:[{type:'text',text:JSON.stringify({data})}]});

async function fixture(testContext, fail = false) {
  const journalDir = await mkdtemp(path.join(os.tmpdir(), 'pbi-refresh-'));
  testContext.after(() => rm(journalDir, {recursive:true,force:true}));
  const calls = [];
  const events = [];
  const instance = {port:54321,processId:42,startTime:'fixture-start'};
  return {calls, events, args:{
    project:'D:/reports/fixture.pbip', tables:['Sales'], journalDir,
    record:(outcome, table) => events.push({outcome, table}),
    resolveInstance:async () => instance,
    withMcp:work => work({async call(tool, {request}) {
      calls.push({tool, ...request});
      switch (request.operation) {
        case 'ListLocalInstances': return text([instance]);
        case 'Connect': return text('verified-local-model');
        case 'List': return text(tool === 'database_operations' ? [{id:'fixture'}] : [{name:'Sales'}]);
        case 'RefreshWithXMLA':
          assert.equal(events.at(-1).outcome, 'dispatch');
          if (fail) throw Error('connection lost');
          return {isError:false,content:[]};
        case 'Execute': return text({rows:[[200]],isTruncated:false});
        default: throw Error('Unexpected operation: '+request.operation);
      }
    }}),
  }};
}

test('refreshes only named live tables and returns their observed row counts', async t => {
  const {args,calls} = await fixture(t);
  const result = await refreshModelTables(args);
  assert.equal(result.ok, true);
  assert.deepEqual(result.observations, [{table:'Sales',rowCount:200}]);
  assert.deepEqual(calls.filter(call => call.operation === 'RefreshWithXMLA').map(call => call.references), [[{name:'Sales'}]]);
  assert.deepEqual(await readdir(args.journalDir), []);
});

test('blocks a repeat refresh after Microsoft fails to acknowledge the first write', async t => {
  const {args,calls} = await fixture(t, true);
  const result = await refreshModelTables(args);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.pendingTable, 'Sales');
  await assert.rejects(refreshModelTables(args), /unresolved outcome/);
  assert.equal(calls.filter(call => call.operation === 'RefreshWithXMLA').length, 1);
});

test('a table missing from the open model stops before dispatch', async t => {
  const {args,calls} = await fixture(t);
  await assert.rejects(refreshModelTables({...args,tables:['Missing']}), /missing in the live model/);
  assert.equal(calls.some(call => call.operation === 'RefreshWithXMLA'), false);
});
