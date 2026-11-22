import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureDesktopProject} from '../prepare-project.mjs';
test('missing exact project runs status then opens with the discovered Store executable',async()=>{
  const calls=[];const execute=async(exe,args,options)=>{calls.push(args);assert.equal(options.env.PBI_DESKTOP_PATH,'C:/Store/PBIDesktop.exe');return {stdout:JSON.stringify(calls.length===1?{error:{code:'HOST_UNAVAILABLE'}}:{data:{ok:true}})};};
  await ensureDesktopProject('C:/Any/Report.pbip','cli.js','C:/Store/PBIDesktop.exe',execute);
  assert.equal(calls.length,2);assert.equal(calls[0].at(-1),'--status');assert.equal(calls[1].at(-1),'desktop');assert.equal(calls[1].includes('--reload'),false);
});
test('unsaved report and malformed status never dispatch open or reload',async()=>{
  for(const payload of [{data:{details:{hasUnsavedChanges:true}}},{data:{}},{error:{code:'RENDER_FAILED'}}]){
    let calls=0;await assert.rejects(ensureDesktopProject('p','c','d',async()=>{calls++;return {stdout:JSON.stringify(payload)};}));assert.equal(calls,1);
  }
});
test('resuming a dirty project is read-only and does not discard its state',async()=>{
  let calls=0;await ensureDesktopProject('p','c','d',async()=>{calls++;return {stdout:JSON.stringify({data:{details:{hasUnsavedChanges:true}}})};},true);assert.equal(calls,1);
});
test('failed open is surfaced once without diagnostic retries',async()=>{
  let calls=0;await assert.rejects(ensureDesktopProject('p','c','d',async()=>({stdout:JSON.stringify(++calls===1?{error:{code:'HOST_UNAVAILABLE'}}:{error:{code:'DESKTOP_EXE_NOT_FOUND'}})})),{code:'DESKTOP_EXE_NOT_FOUND'});assert.equal(calls,2);
});
test('ambiguous matching instances do not trigger another Desktop launch',async()=>{let calls=0;await assert.rejects(ensureDesktopProject('p','c','d',async()=>{calls++;return {stdout:JSON.stringify({error:{code:'HOST_UNAVAILABLE',details:{candidatePids:[10,20]}}})};}),{code:'PROJECT_AMBIGUOUS'});assert.equal(calls,1);});
