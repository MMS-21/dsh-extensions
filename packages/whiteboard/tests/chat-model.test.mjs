import test from 'node:test';
import assert from 'node:assert/strict';
import { chatModelState, modelCaption } from '../lib/chat-model.js';

const first = { provider: 'p', model: 'a', reasoningEffort: 'high' };
const second = { provider: 'p', model: 'b' };
const catalog = { default: first, groups: [{ id: 'p', name: 'Provider', models: [{ id: 'a', name: 'Model A' }, { id: 'b', name: 'Model B' }] }] };

test('model state distinguishes configured default, next model, and last used', () => {
  const list = { phase: 'ready', ids: ['chat'], byId: { chat: { id: 'chat', projectionValues: { modelSelection: { next: second, lastUsed: first } } } } };
  assert.deepEqual(chatModelState(catalog, list, null).current, first);
  const selected = chatModelState(catalog, list, 'chat');
  assert.deepEqual(selected.current, second);
  assert.deepEqual(selected.lastUsed, first);
  assert.equal(modelCaption(catalog, selected.lastUsed), 'Model A · Provider · high');
});

test('an unresolved session model is not mislabeled as the configured default', () => {
  const state = chatModelState(catalog, { phase: 'ready', ids: ['chat'], byId: { chat: { id: 'chat' } } }, 'chat');
  assert.equal(state.current, null);
  assert.equal(state.defaultSelection, first);
  assert.equal(chatModelState(catalog, { phase: 'pending', ids: [], byId: {} }, 'chat').sessionId, 'chat');
});

test('subagents cannot become Whiteboard destination chats and missing models retain their ids', () => {
  const list = { phase: 'ready', ids: ['child'], byId: { child: { id: 'child', origin: 'subagent' } } };
  assert.equal(chatModelState(catalog, list, null).sessions.length, 0);
  assert.equal(modelCaption(catalog, { provider: 'other', model: 'retired' }), 'retired · other');
});
