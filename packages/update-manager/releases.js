const repository = 'MMS-21/dsh-extensions';
const packageName = '@local/dsh-plugin-render-ui';
const archiveName = 'render-ui.tgz';
const metadataName = 'render-ui-update.json';
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function newer(candidate, installed) {
  if (!versionPattern.test(candidate) || !versionPattern.test(installed)) return false;
  const before = installed.split('.').map(BigInt);
  const after = candidate.split('.').map(BigInt);
  const changed = after.findIndex((part, i) => part !== before[i]);
  return changed >= 0 && after[changed] > before[changed];
}

async function readJson(url, signal) {
  const response = await fetch(url, {signal, headers:{Accept:'application/json'}});
  if (!response.ok) throw Error(`GitHub returned HTTP ${response.status}`);
  return response.json();
}

export async function checkRenderUiRelease({installed, dshVersion, signal, getJson = readJson}) {
  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
  const releases = await getJson(`https://api.github.com/repos/${repository}/releases?per_page=30`, requestSignal);
  const release = releases.find(item => !item.draft && !item.prerelease
    && /^render-ui-v\d+\.\d+\.\d+$/.test(item.tag_name)
    && newer(item.tag_name.slice('render-ui-v'.length), installed.version));
  if (!release) return {status:'no-newer-release'};

  const releaseVersion = release.tag_name.slice('render-ui-v'.length);
  const base = `https://github.com/${repository}/releases/download/${release.tag_name}/`;
  const digest = release.assets.find(asset => asset.name === archiveName)?.digest;
  const hasMetadata = release.assets.some(asset => asset.name === metadataName);
  if (!hasMetadata || !/^sha256:[a-f\d]{64}$/.test(digest ?? '')) return {status:'incomplete-release'};
  const metadata = await getJson(base + metadataName, requestSignal);
  if (metadata.schema !== 1 || metadata.package !== packageName || metadata.version !== releaseVersion
      || metadata.sha256 !== digest.slice('sha256:'.length)) return {status:'invalid-release'};
  const actual = Object.fromEntries(installed.peers.filter(peer => peer.actual).map(peer => [peer.name, peer.actual]));
  const expected = metadata.peers;
  if (typeof dshVersion !== 'string' || metadata.dshVersion !== dshVersion
      || !expected || Object.keys(expected).length !== 2
      || installed.missingClientPackages.length
      || !['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-typert-protocol']
        .every(peer => typeof expected[peer] === 'string' && expected[peer] === actual[peer])) {
    return {status:'incompatible-release', version:releaseVersion};
  }
  return {status:'compatible-release', version:releaseVersion, url:base + archiveName, digest};
}
import {createHash, randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';


export async function stageRenderUiRelease({installed, dshVersion, directory, signal, getJson, download = fetch}) {
  const release = await checkRenderUiRelease({installed, dshVersion, signal, getJson});
  if (release.status !== 'compatible-release') return release;
  const timeout = AbortSignal.timeout(60000);
  const requestSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
  const response = await download(release.url, {signal:requestSignal});
  if (!response.ok || !response.body) throw Error(`Release download returned HTTP ${response.status}`);

  await mkdir(directory, {recursive:true});
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  const dest = path.join(directory, `render-ui-${release.version}-${release.digest.slice(7)}.tgz`);
  const hash = createHash('sha256');
  let size = 0;
  const verify = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) return done(Error('Release archive exceeded 32 MiB'));
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(temporary, {flags:'wx'}), {signal:requestSignal});
    if (`sha256:${hash.digest('hex')}` !== release.digest) throw Error('Downloaded release checksum did not match GitHub');
    await rename(temporary, dest);
  } finally {
    await rm(temporary, {force:true});
  }
  return {status:'staged', version:release.version, archive:dest, digest:release.digest};
}
