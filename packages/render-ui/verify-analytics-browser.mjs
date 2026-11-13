import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const {chromium}=await import('playwright-core');
const root=fileURLToPath(new URL('.',import.meta.url));
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,pathname==='/'?'openui-preview.html':'.'+pathname);if(!file.startsWith(root))throw Error('Bad path');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/plain');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
const page=await browser.newPage({viewport:{width:1440,height:1100},colorScheme:'dark',reducedMotion:'reduce'});
const errors=[],remote=[];page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:'))remote.push(request.url());});
const base=`http://127.0.0.1:${server.address().port}/?obsidian`;
await mkdir('analytics-artifacts',{recursive:true});
try{
  await page.goto(base);
  await page.getByRole('heading',{name:'Overview',exact:true}).waitFor();
  assert.equal(await page.locator('.obsidian-analytics-dashboard').count(),1);
  assert.equal(await page.evaluate(()=>__dshTest.toolCalls.length),0,'render must not ask the agent');
  await page.getByRole('button',{name:'Repositories',exact:true}).click();
  await page.getByPlaceholder('Find a repository…').fill('api');
  await page.getByRole('heading',{name:'acme/api'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'acme/web'}).count(),0);
  await page.getByRole('button',{name:'Code review',exact:true}).click();
  await page.getByRole('button',{name:'Details for PR #101',exact:true}).click();
  const question=page.getByRole('textbox',{name:'Ask anything about PR'});
  await question.fill('What does this change?');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('The change restores keyboard focus when the PR panel closes.',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>__dshTest.toolCalls);assert.equal(calls.length,1);assert.equal(calls[0].args.pullRequest.number,101);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('radio',{name:'Teal',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).count(),0);
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.obsidian-analytics-dashboard .enter')].every(node=>Number(getComputedStyle(node).opacity)>.99));
  const statuses=page.getByRole('group',{name:'Daily status'});
  await statuses.getByRole('button',{name:'2026-11-11: No data'}).focus();
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.dsh-status-detail').textContent(),/2026-11-12/);
  for(const width of [1440,420]){
    await page.setViewportSize({width,height:1100});
    for(const theme of ['dark','light']){
      await page.emulateMedia({colorScheme:theme});
      await page.evaluate(mode=>document.body.style.background=mode==='dark'?'#12151c':'#f4f5f7',theme);
      await page.mouse.move(0,0);
      await page.waitForFunction(mode=>document.querySelector('.dsh-analytics-block').classList.contains('dark')===(mode==='dark'),theme);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`analytics-artifacts/${theme}-${width}.png`,fullPage:true});
    }
  }
  await page.goto(base+'&draft');
  await page.getByRole('button',{name:'Sidebar',exact:true}).click();
  await page.getByRole('button',{name:'Code review',exact:true}).click();
  await page.getByRole('button',{name:'Details for PR #101',exact:true}).click();
  await question.fill('Explain this PR');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText(/Question added to the source chat composer/).waitFor();
  assert.equal((await page.evaluate(()=>__dshTest.requests))[0],'About acme/web PR #101: Explain this PR');
  assert.equal(await page.evaluate(()=>__dshTest.toolCalls.length),0);
  await page.goto(base+'&stream');
  await page.getByText('Unvalidated streaming preview — actions disabled').waitFor({state:'attached'});
  assert.equal(await page.evaluate(()=>__dshTest.toolCalls.length),0);
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  console.log('PASS: actual bundle dashboard navigation/search/PR answers, appearance, keyboard status bars, draft fallback, stream isolation, themes and responsive bounds; no external requests');
}catch(error){console.error('Page text:',(await page.locator('body').innerText()).slice(-4000));console.error(errors);throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}


