import test from 'node:test';
import assert from 'node:assert/strict';
import {saveVerifiedProject} from '../save-project.mjs';
const project='C:/Reports/Exact.pbip';
const status=dirty=>({instances:[{pid:123,bridgeStatus:'connected',currentFilePath:project,hasUnsavedChanges:dirty}]});
test('save binds the exact project/PID and verifies persistence, never reloads',async()=>{
  let read=0;const submitted=[];
  const result=await saveVerifiedProject(project,'hash',{snapshot:()=> 'hash',status:async()=>status(++read<3),submit:async pid=>submitted.push(pid),wait:async()=>{}});
  assert.equal(result.saved,true);assert.deepEqual(submitted,[123]);assert.equal(read,3);
});
test('an already saved project never receives input',async()=>{let sent=false;const result=await saveVerifiedProject(project,'h',{snapshot:()=> 'h',status:async()=>status(false),submit:async()=>sent=true});assert.equal(result.alreadySaved,true);assert.equal(sent,false);});
test('wrong project, ambiguity and changed definitions stop before input',async()=>{
  let sent=false;
  for(const options of [
    {snapshot:()=> 'changed',status:async()=>status(true)},
    {snapshot:()=> 'h',status:async()=>({instances:[{...status(true).instances[0],currentFilePath:'C:/Other/Exact.pbip'}]})},
    {snapshot:()=> 'h',status:async()=>({instances:[...status(true).instances,...status(true).instances]})},
  ])await assert.rejects(saveVerifiedProject(project,'h',{...options,submit:async()=>sent=true}));
  assert.equal(sent,false);
});
test('uncertain save dispatch is not repeated by the adapter',async()=>{let sent=0;await assert.rejects(saveVerifiedProject(project,'h',{snapshot:()=> 'h',status:async()=>status(true),submit:async()=>sent++,wait:async()=>{}}),{code:'SAVE_OUTCOME_UNKNOWN'});assert.equal(sent,1);});
