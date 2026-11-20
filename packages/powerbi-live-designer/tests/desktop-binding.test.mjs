import test from 'node:test';
import assert from 'node:assert/strict';
import {selectInstance} from '../desktop-binding.mjs';
const original={processId:2,parentProcessName:'PBIDesktop',parentWindowTitle:'test'};
const probe={processId:4,parentProcessName:'PBIDesktop',parentWindowTitle:'test'};
const processes=[{ProcessId:2,ParentProcessId:1},{ProcessId:4,ParentProcessId:3}];
const status={instances:[{pid:1,bridgeStatus:'connected',currentFilePath:'C:/reports/test.pbip'},{pid:3,bridgeStatus:'connected',currentFilePath:'C:/probe/test.pbip'}]};
test('duplicate window titles select the engine belonging to the exact PBIP path',()=>{
 assert.equal(selectInstance('C:/reports/test.pbip',[original,probe],status,processes),original);
 assert.equal(selectInstance('C:/probe/test.pbip',[original,probe],status,processes),probe);
});
test('wrong project and wrong engine ownership fail closed',()=>{
 assert.throws(()=>selectInstance('C:/missing/test.pbip',[original,probe],status,processes),/exactly one/);
 assert.throws(()=>selectInstance('C:/reports/test.pbip',[probe],status,processes),/semantic-model process/);
});
