import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await mkdtemp(fileURLToPath(new URL('./artifact-browser-', import.meta.url)));
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=0', '--disable-background-networking', '--no-default-browser-check',
  '--user-data-dir=' + profile, 'about:blank'], {windowsHide:true, stdio:'ignore'});

async function until(check) {
  for (let attempt = 0; attempt < 150; attempt++) {
    try { const result = await check(); if (result) return result; } catch {}
    await delay(100);
  }
  throw new Error('Timed out waiting for browser fixture');
}

try {
  const port = await until(async () => (await readFile(profile + '/DevToolsActivePort', 'utf8')).split(/\r?\n/)[0]);
  const page = await until(async () => (await fetch('http://127.0.0.1:' + port + '/json/list').then(r => r.json())).find(t => t.type === 'page'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => {ws.onopen = resolve; ws.onerror = reject;});
    let id = 0;
    const pending = new Map();
    ws.onmessage = ({data}) => {
      const response = JSON.parse(data);
      const waiter = pending.get(response.id);
      if (!waiter) return;
      pending.delete(response.id);
      if (response.error) waiter.reject(new Error(response.error.message));
      else waiter.resolve(response.result);
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      pending.set(++id, {resolve, reject});
      ws.send(JSON.stringify({id, method, params}));
    });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', {expression, returnByValue:true});
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const click = async label => {
      const button = `[...document.querySelectorAll('button')].find(b => (b.querySelector('.dsh-library-row-title') ?? b).textContent.trim() === ${JSON.stringify(label)})`;
      await until(() => evaluate(`Boolean(${button})`));
      await evaluate(`${button}.click()`);
    };
    const body = () => evaluate('document.body.innerText');
    await call('Emulation.setDeviceMetricsOverride', {width:1100,height:780,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate', {url:new URL('./openui-preview.html?artifacts', import.meta.url).href});
    await until(async () => (await body()).includes('Inline explanation'));
    assert.match(await body(), /Introductory prose[\s\S]+Inline explanation[\s\S]+Follow-up prose/);
    await until(async () => (await body()).includes('Estimate: 5'));
    await click('Double estimate');
    await until(async () => (await body()).includes('Estimate: 10'));
    assert.equal(await evaluate("Boolean(document.querySelector('.dsh-artifact-frame'))"), false);
    await click('Open in sidebar');
    await until(() => evaluate("document.querySelector('.dsh-artifact-frame')?.innerText.includes('Estimate: 10')"));
    assert.equal(await evaluate("Object.keys(localStorage).filter(k => k.startsWith('dsh-render-ui-artifact-v1:')).length"), 0);
    await click('Save artifact');
    await until(async () => (await body()).includes('Saved to Artifacts'));
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.dsh-artifact-frame')).color === getComputedStyle(document.body).color`), true);
    const screenshot = await call('Page.captureScreenshot', {format:'png'});
    await writeFile(new URL('./artifact-preview.png', import.meta.url), Buffer.from(screenshot.data, 'base64'));
    await call('Page.reload');
    await click('Show saved views');
    await click('Methods explorer');
    await until(async () => (await body()).includes('Estimate: 10'));
    const libraryScreenshot = await call('Page.captureScreenshot', {format:'png'});
    await writeFile(new URL('./artifact-library-preview.png', import.meta.url), Buffer.from(libraryScreenshot.data, 'base64'));
    assert.equal(await evaluate('window.__dshTest.toolCalls.length'), 0);
    await call('Emulation.setDeviceMetricsOverride', {width:420,height:780,deviceScaleFactor:1,mobile:false});
    await until(() => evaluate('innerWidth === 420'));
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), true);
    assert.deepEqual(await evaluate('window.__dshTest.errors'), []);
    console.log('Verified inline placement, explicit save, reload and library reopen, and 420px layout in Edge.');
    await call('Browser.close');
  } finally {ws.close();}
} finally {browser.kill();}
