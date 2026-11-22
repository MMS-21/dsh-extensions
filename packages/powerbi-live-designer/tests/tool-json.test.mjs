import test from 'node:test';
import assert from 'node:assert/strict';
import {toolJson,jsonTool} from '../tool-json.mjs';

test('absent optional fields are omitted recursively without changing meaningful values',()=>{
 const input={phase:'prepared',blocker:undefined,result:{attempt:undefined,passed:false,rows:0,value:null,amount:1.25},observations:[{table:'A',details:undefined}]};
 const value=toolJson(input);
 assert.deepEqual(value,{phase:'prepared',result:{passed:false,rows:0,value:null,amount:1.25},observations:[{table:'A'}]});
 assert.deepEqual(JSON.parse(JSON.stringify(value)),value);
 assert.equal(Object.hasOwn(input,'blocker'),true,'Do not mutate the durable source');
 assert.equal(Object.is(toolJson(-0),-0),false);
});
test('invalid numerical evidence is rejected rather than silently becoming null',()=>{
 for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>toolJson({checks:[{actual:value}]}),error=>error.code==='PLUGIN_OUTPUT_INVALID'&&/non-finite/.test(error.message));
});
test('cycles, executable objects, sparse arrays and unsupported values cannot cross the output boundary',()=>{
 const cycle={};cycle.self=cycle;
 for(const value of [undefined,1n,()=>{},new Date(),Buffer.from('data'),new Map(),cycle,[undefined],Array(1),Object.assign([],{extra:1}),{[Symbol('secret')]:1}])assert.throws(()=>toolJson(value),{code:'PLUGIN_OUTPUT_INVALID'});
 let invoked=false;const getter={get private(){invoked=true;throw Error('secret');}};
 assert.throws(()=>toolJson(getter),{code:'PLUGIN_OUTPUT_INVALID'});assert.equal(invoked,false);
});
test('tool wrapper preserves sync errors, async failures, and executes mutations only once',async()=>{
 let writes=0;const sync=jsonTool({execute(){writes++;return {ok:true,optional:undefined};}});
 assert.deepEqual(sync.execute(),{ok:true});assert.equal(writes,1);
 const asyncTool=jsonTool({async execute(){writes++;return {ok:true,optional:undefined};}});
 assert.deepEqual(await asyncTool.execute(),{ok:true});assert.equal(writes,2);
 const broken=jsonTool({async execute(){writes++;return {actual:Infinity};}});
 await assert.rejects(broken.execute(),{code:'PLUGIN_OUTPUT_INVALID'});assert.equal(writes,3);
 const error=Object.assign(Error('Unknown refresh outcome'),{code:'OUTCOME_UNKNOWN'});
 assert.throws(()=>jsonTool({execute(){throw error;}}).execute(),e=>e===error);
 await assert.rejects(jsonTool({async execute(){throw error;}}).execute(),e=>e===error);
});
