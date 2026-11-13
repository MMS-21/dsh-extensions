import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverChatArtifacts} from './src/artifact-history.js';
import {resourcesFromHistory} from './src/artifact-resources.js';

test('catalogs delivered and created files, image attachments and safe links with source scope', () => {
  const event = (type, data, time) => ({event:{type, data, time}});
  const entries = [
    event('tool/call', {name:'write', callId:'good', arguments:JSON.stringify({file_path:'a #1.csv', content:''})}, 1),
    event('tool/result', {message:{source:{callId:'good'}}, meta:{path:'C:\\work\\a #1.csv'}}, 2),
    event('tool/call', {name:'write', callId:'bad', arguments:JSON.stringify({file_path:'failed.csv', content:''})}, 3),
    event('tool/result', {message:{source:{callId:'bad'}, isError:true}}, 4),
    event('deliverables/presented', {files:[{path:'a #1.csv', description:'Final data'}, {path:'chart.png'}]}, 5),
    event('assistant/message', {message:{content:[{type:'text', text:[
      '[Docs](https://example.org/wiki/Topic_(detail)) and https://example.org/plain.',
      '![Trend](https://example.org/chart?id=1)',
      '[Unsafe](javascript:alert(1)) https://user:password@example.org/',
      '```text', 'https://example.org/sample', '```', '`https://example.org/code`',
    ].join('\n')}]}}, 6),
    event('user/message', {content:[
      {type:'image', attachment:{attachmentId:'image-id', mediaType:'image/png', name:'Upload.png'}},
      {type:'file', attachment:{attachmentId:'file-id', name:'Input.pdf'}},
    ]}, 7),
  ];
  const found = resourcesFromHistory('chat', entries, 'C:\\work');
  assert.deepEqual(found.map(item => [item.kind, item.title]), [
    ['files', 'a #1.csv'], ['images', 'chart.png'], ['links', 'Docs'], ['links', 'example.org'],
    ['images', 'Trend'], ['images', 'Upload.png'], ['files', 'Input.pdf'],
  ]);
  assert.equal(found[0].description, 'Final data');
  assert.equal(found[0].address, 'dsh-resource://file/session/chat/a%20%231.csv');
  assert.equal(found[2].url, 'https://example.org/wiki/Topic_(detail)');
  assert.equal(found[3].url, 'https://example.org/plain');
});

test('recovers historical render results from a chat, including an older page', async () => {
  const spec = {view: 'openui', title: 'Sales', lang: 'root = Stack([])'};
  const event = {
    type: 'tool/result', time: 123,
    data: {message: {source: {callId: 'old-render'}}, meta: {tool: 'render_ui', version: 1, spec}},
  };
  let older = false;
  let released = false;
  const binding = {
    session: {
      getSnapshot: () => ({openState: 'open', hasMore: !older}),
      loadOlder: async () => { older = true; },
    },
    eventSource: {getSnapshot: () => ({entries: older ? [
      {event},
      {event: {...event, data: {...event.data, message: {isError: true, source: {callId: 'failed'}}}}},
      {event: {type: 'tool/result'}},
    ] : []})},
  };
  const sessions = {
    refresh: async () => {},
    list: {getSnapshot: () => ({ids: ['blank', 'chat'], byId: {
      blank: {blank: true, updatedAt: 2}, chat: {blank: false, updatedAt: 1},
    }})},
    retain(id) {
      assert.equal(id, 'chat');
      return {ready: Promise.resolve(binding), release: () => { released = true; }};
    },
  };
  const published = [];
  await discoverChatArtifacts(sessions, new AbortController().signal, rows => published.push(...rows));
  assert.deepEqual(published, [{
    id: '["chat","old-render"]', title: 'Sales', spec, savedAt: 123, fromChat: true,
  }]);
  assert.equal(released, true);
});
