import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {homedir} from 'node:os';

const pluginUrl = process.argv.includes('--installed')
  ? pathToFileURL(join(homedir(), '.dsh/profiles/desktop/node_modules/@local/dsh-plugin-render-ui/lib/index.js'))
  : new URL('./lib/index.js', import.meta.url);
const renderUi = await import(pluginUrl.href);

const runtime = pathToFileURL(join(process.env.LOCALAPPDATA,
  'Programs/DeepSeek Harness/resources/app.asar/dsh/node_modules/@deepseek-ai')).href + '/';
const {Context} = await import(runtime + 'cordis/lib/index.js');
const {LocalFileSystem} = await import(runtime + 'dsh-fs-local/lib/index.js');
const {ToolRuntime} = await import(runtime + 'dsh-tools/lib/index.js');
const {createScope} = await import(runtime + 'dsh-scope/lib/index.js');
const workspace = await mkdtemp(fileURLToPath(new URL('./snapshot-host-', import.meta.url)));
await mkdir(join(workspace, '.dsh-ui-data'));
await writeFile(join(workspace, '.dsh-ui-data', 'metrics.json'), '{"values":[5,10]}');

const ctx = new Context();
function provide(name, value) {
  ctx.provide(name);
  ctx.set(name, value);
}
provide('systemPrompt', {tools() {}, section() {}});
provide('sessionProjections', {});
provide('workingDirectory', {ensure: () => workspace});
const agent = {session:{id:'snapshot-smoke'}};
provide('agents', {get: id => id === agent.session.id ? agent : undefined});
const scope = createScope(ctx, agent);
agent.ctx = scope.ctx;
new ToolRuntime(ctx, {mode:'native'});
const fs = ctx.plugin(LocalFileSystem, {cwd:workspace});
await fs.await();
const plugin = ctx.plugin(renderUi);
await plugin.await();
try {
  const tool = ctx.tools.get('render_ui', agent);
  assert.ok(tool, 'The packaged tool registry must accept render_ui.');
  const args = {
    lang:'data = Query("ui_snapshot", {}, {})\nroot = Stack([TextContent("Snapshot")])',
    dataFile:'metrics.json',
  };
  const value = await tool.execute(args, {agent, signal:new AbortController().signal});
  assert.deepEqual(tool.output.presentationMeta(args, value).spec.snapshot.data, {values:[5,10]});
  assert.doesNotMatch(JSON.stringify(tool.output.render(args, value)), /values/);
  const mini = {
    title:'Research methods explorer',
    miniApp:{html:'<output data-output="value"></output>', code:'function calculate(inputs,data){return {value:data.values[0]}}'},
    dataFile:'metrics.json',
    selectionKeys:['weight'],
  };
  const miniResult = await tool.execute(mini, {agent, signal:new AbortController().signal});
  const miniSpec = tool.output.presentationMeta(mini, miniResult).spec;
  assert.equal(miniSpec.view, 'mini-app');
  assert.deepEqual(miniSpec.snapshot.data, {values:[5,10]});
  console.log('Packaged DSH filesystem and tool registry verified the data snapshot handoff.');
} finally {
  await plugin.dispose();
  await fs.dispose();
  await scope.dispose();
}
