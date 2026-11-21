import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {checkRenderUiRelease, stageRenderUiRelease} from '../releases.js';

const peers = {'@deepseek-ai/dsh-tools':'0.2.2-rc.5', '@deepseek-ai/dsh-typert-protocol':'0.2.2-rc.5'};
const installed = {
  version:'0.1.0',
  peers:Object.entries(peers).map(([name, actual]) => ({name, actual})),
  missingClientPackages:[],
};
const checksum = 'a'.repeat(64);
const release = {
  tag_name:'render-ui-v0.2.0',
  assets:[{name:'render-ui.tgz', digest:`sha256:${checksum}`}, {name:'render-ui-update.json'}],
};
const metadata = {
  schema:1, package:'@local/dsh-plugin-render-ui', version:'0.2.0',
  dshVersion:'0.2.2-rc.5', peers, sha256:checksum,
};

function check({listing = [release], manifest = metadata, dshVersion = metadata.dshVersion} = {}) {
  const requests = [];
  return checkRenderUiRelease({
    installed, dshVersion,
    async getJson(url) {
      requests.push(url);
      if (requests.length === 1) {
        assert.equal(url, 'https://api.github.com/repos/MMS-21/dsh-extensions/releases?per_page=30');
        return listing;
      }
      assert.equal(url, 'https://github.com/MMS-21/dsh-extensions/releases/download/render-ui-v0.2.0/render-ui-update.json');
      return manifest;
    },
  });
}

test('offers a newer Render UI release with matching DSH peers and digest', async () => {
  assert.deepEqual(await check(), {
    status:'compatible-release', version:'0.2.0', digest:`sha256:${checksum}`,
    url:'https://github.com/MMS-21/dsh-extensions/releases/download/render-ui-v0.2.0/render-ui.tgz',
  });
});

test('skips prereleases and installed or older package versions', async () => {
  const listing = [{...release, prerelease:true}, {...release, tag_name:'render-ui-v0.1.0'}];
  assert.equal((await check({listing})).status, 'no-newer-release');
});

test('rejects mismatched artifact identity and checksum', async () => {
  assert.equal((await check({manifest:{...metadata, package:'other'}})).status, 'invalid-release');
  assert.equal((await check({manifest:{...metadata, sha256:'b'.repeat(64)}})).status, 'invalid-release');
});

test('rejects a different DSH version or unknown peer set', async () => {
  assert.equal((await check({dshVersion:'0.2.2-rc.6'})).status, 'incompatible-release');
  assert.equal((await check({manifest:{...metadata, peers:{a:'1', b:'2'}}})).status, 'incompatible-release');
});

test('stages verified bytes and cleans up a mismatched download', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-release-test-'));
  const contents = 'synthetic archive bytes';
  const sha256 = createHash('sha256').update(contents).digest('hex');
  const listing = [{...release, assets:[{name:'render-ui.tgz', digest:`sha256:${sha256}`}, release.assets[1]]}];
  const input = {
    installed, directory, dshVersion:metadata.dshVersion,
    getJson: async url => url.startsWith('https://api.github.com/') ? listing : {...metadata, sha256},
  };
  try {
    await assert.rejects(stageRenderUiRelease({...input, download:async () => new Response('wrong bytes')}), /checksum/);
    assert.deepEqual(await readdir(directory), []);
    const result = await stageRenderUiRelease({...input, download:async () => new Response(contents)});
    assert.equal(result.status, 'staged');
    assert.equal(await readFile(result.archive, 'utf8'), contents);
  } finally {
    await rm(directory, {recursive:true, force:true});
  }
});
