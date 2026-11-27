import test from 'node:test';
import assert from 'node:assert/strict';
import {installCodexCompatibility} from '../codex-compat.mjs';

test('frozen reviewer request is copied before dispatch and remains unchanged',async()=>{
  const options=Object.freeze({provider:'openai-codex',temperature:0.7,model:'example',signal:new AbortController().signal});
  let received;
  const llm={async *stream(value){assert.equal(this,llm);received=value;yield 'chunk';}};
  const original=llm.stream;
  const dispose=installCodexCompatibility(llm);
  const chunks=[];for await(const chunk of llm.stream(options))chunks.push(chunk);
  assert.deepEqual(chunks,['chunk']);assert.equal(Object.hasOwn(received,'temperature'),false);
  assert.equal(received.signal,options.signal);assert.equal(options.temperature,0.7);
  dispose();assert.equal(llm.stream,original);
});

test('other providers and Codex requests without temperature preserve request identity',async()=>{
  const seen=[];const llm={async *stream(value){seen.push(value);yield 1;}};
  const dispose=installCodexCompatibility(llm);
  const inputs=[Object.freeze({provider:'nousresearch',temperature:0.5}),Object.freeze({provider:'openai-codex'})];
  for(const input of inputs)for await(const chunk of llm.stream(input)){}
  assert.equal(seen[0],inputs[0]);assert.equal(seen[1],inputs[1]);dispose();
});
