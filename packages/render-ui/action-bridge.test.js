import test from 'node:test';import assert from 'node:assert/strict';import {createActionBridge,actionRequest} from './src/action-bridge.js';
test('agent requests append to the scoped composer and focus it without submitting', async () => {
  const calls = [];
  const input = {
    requestDraftInitialization(binding, options) {
      assert.equal(binding.ctx, scope);
      calls.push(options);
      return 'applied';
    },
    for(ctx) {
      assert.equal(ctx, scope);
      return {focus() { calls.push('focused'); }};
    },
  };
  const scope = {get(name) {
    assert.equal(name, 'conversation');
    return {input, send() { assert.fail('must not submit'); }};
  }};
  const bridge = createActionBridge({sessions:{binding(id) {
    assert.equal(id, 'session-a');
    return {ctx:scope};
  }}}, 'session-a');
  await bridge('Inspect PR 42');
  assert.deepEqual(calls, [{prompt:'Inspect PR 42', whenDraftExists:'append'}, 'focused']);
  await assert.rejects(() => bridge(''));
  await assert.rejects(() => bridge('x'.repeat(12001)));
});
test('missing scopes fail closed without root service fallback', async () => {
  await assert.rejects(() => createActionBridge({}, '')('Do something'));
  await assert.rejects(() => createActionBridge({sessions:{binding(){return undefined;}}}, 'unknown')('Do something'));
});
test('form submission includes reviewable values but redacts credential fields',()=>{const text=actionRequest({type:'continue_conversation',params:{context:'Review only'},humanFriendlyMessage:'Inspect branch',formState:{review:{branch:{value:'main'},apiToken:{value:'do-not-send'}}}});assert.match(text,/main/);assert.match(text,/Review only/);assert.match(text,/redacted/);assert.doesNotMatch(text,/do-not-send/);});
test('external actions only become reviewable bounded agent requests',()=>{assert.equal(actionRequest({type:'continue_conversation',params:{},humanFriendlyMessage:'Review CI'}),'Review CI');for(const type of ['merge_pr','execute','open_url','run'])assert.throws(()=>actionRequest({type,params:{text:'x'}}));assert.throws(()=>actionRequest({type:'continue_conversation',params:{},humanFriendlyMessage:'x'.repeat(12001)}));});
