import test from 'node:test';
import assert from 'node:assert/strict';
import {apply} from './lib/index.js';
import {executeUiTool} from './lib/tool-execution.js';
import {createSelection, readSnapshot} from './src/data-snapshot.js';

const args = {lang:'root = Stack([])', dataFile:'metrics.json', selectionKeys:['office']};
const exec = {agent:{session:{id:'test'}}, signal:new AbortController().signal};

function fixture(json, escaped = false) {
  const tools = new Map();
  const ctx = {
    tools:{register(tool) { tools.set(tool.name, tool); }},
    workingDirectory:{ensure(agent) { assert.equal(agent, exec.agent); return '/project'; }},
    fs:{
      async lstat(name) { return {type:name.endsWith('.json') ? 'file' : 'directory'}; },
      async resolve(name, options) {
        assert.equal(options.cwd, '/project');
        if (name === '.') return '/project';
        return escaped && name.endsWith('.json') ? '/unrelated/metrics.json' : '/project/' + name;
      },
      contains(parent, child) { return child.startsWith(parent + '/'); },
      async readBytes(target, signal, limit) {
        assert.equal(target, '/project/.dsh-ui-data/metrics.json');
        assert.equal(signal, exec.signal);
        assert.equal(limit, 65_536);
        return Buffer.from(json);
      },
    },
  };
  apply(ctx);
  return tools.get('render_ui');
}

test('render_ui attaches computed data to presentation metadata and emits a small model response', async () => {
  const tool = fixture('{"east":[4,8],"west":[6,7]}');
  const result = await tool.execute(args, exec);
  const {spec} = tool.output.presentationMeta(args, result);
  assert.match(spec.snapshot.id, /^[a-f0-9]{64}$/);
  assert.deepEqual(readSnapshot(spec, {}), {east:[4,8],west:[6,7]});
  assert.throws(() => readSnapshot(spec, {file:'elsewhere'}), /no arguments/);
  assert.doesNotMatch(JSON.stringify(tool.output.render(args, result)), /east|west/);
  const selection = createSelection(spec);
  selection.update({$office:'east', $secret:'exclude', form:{text:'exclude'}});
  assert.deepEqual(selection.current, {$office:'east'});
  assert.deepEqual(createSelection(spec, selection.current).current, {$office:'east'});
});

test('snapshot ingestion rejects paths, escaped targets, and unsafe or oversized data', async () => {
  await assert.rejects(fixture('{}').execute({...args, dataFile:'../metrics.json'}, exec), /filename/);
  await assert.rejects(fixture('{}', true).execute(args, exec), /inside the workspace/);
  await assert.rejects(fixture('{"__proto__":{}}').execute(args, exec), /reserved key/);
  await assert.rejects(fixture('{"value":"' + 'x'.repeat(65_536) + '"}').execute(args, exec), /64 KiB/);
});

test('the existing browser tool bridge cannot request a new file snapshot', async () => {
  const ctx = {agents:new Map([['test', exec.agent]])};
  const request = {name:'render_ui', arguments:args};
  await assert.rejects(executeUiTool(ctx, exec.agent, request, exec.signal), /from an agent turn/);
});
