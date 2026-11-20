import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feedVersion, monitor} from './monitor-dsh-release.mjs';
test('official feed versions are parsed without accepting arbitrary YAML', () => {
  assert.equal(feedVersion('version: 0.2.2-rc.5\nfiles: []'), '0.2.2-rc.5');
  assert.throws(() => feedVersion('version: !!js/function bad'));
});
test('same release does not call GitHub', async () => {
  let calls = 0;
  const result = await monitor({baseline:'0.2.2-rc.5', token:'fixture', repository:'owner/repo', fetcher:async () => {calls++;return new Response('version: 0.2.2-rc.5');}});
  assert.equal(result.changed, false); assert.equal(calls, 1);
});
test('existing compatibility issue prevents duplicate notifications', async () => {
  let calls = 0;
  const result = await monitor({baseline:'0.2.2-rc.5', token:'fixture', repository:'owner/repo', fetcher:async () => ++calls === 1 ? new Response('version: 0.2.2-rc.6') : Response.json([{title:'DSH 0.2.2-rc.6: extension compatibility review'}])});
  assert.equal(result.existing, true); assert.equal(calls, 2);
});
test('feed failures remain failures rather than reporting compatibility', async () => {
  await assert.rejects(monitor({baseline:'0.2.2-rc.5', fetcher:async () => new Response('',{status:503})}), /503/);
});
test('new release creates one issue and does not change package manifests', async () => {
  let calls = 0;
  const result = await monitor({baseline:'0.2.2-rc.5', token:'fixture', repository:'owner/repo', fetcher:async (url, options) => {
    calls++; if(calls === 1) return new Response('version: 0.2.2-rc.6');
    if(calls === 2) return Response.json([]);
    assert.equal(options.method,'POST'); assert.match(JSON.parse(options.body).title,/rc.6/);
    return Response.json({html_url:'https://github.com/owner/repo/issues/1'});
  }});
  assert.equal(result.changed,true); assert.equal(calls,3);
});
