import {pathToFileURL} from 'node:url';

export const FEED = 'https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml';
export function feedVersion(text) {
  const match = /^version:\s*['"]?([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)['"]?\s*$/m.exec(text);
  if (!match) throw Error('Official feed did not contain a recognized version');
  return match[1];
}
export async function monitor({fetcher = fetch, token, repository, baseline}) {
  const response = await fetcher(FEED, {signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`Official release feed returned ${response.status}`);
  const version = feedVersion(await response.text());
  const result = {version, baseline, changed: version !== baseline};
  if (!result.changed || !token) return result;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw Error('Invalid GitHub repository');
  const api = `https://api.github.com/repos/${repository}`;
  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json'};
  const title = `DSH ${version}: extension compatibility review`;
  const list = await fetcher(`${api}/issues?state=all&creator=github-actions%5Bbot%5D&per_page=100`, {headers, signal: AbortSignal.timeout(30000)});
  if (!list.ok) throw Error(`GitHub issue lookup returned ${list.status}`);
  if ((await list.json()).some(issue => issue.title === title)) return {...result, existing: true};
  const created = await fetcher(`${api}/issues`, {method: 'POST', headers, signal: AbortSignal.timeout(30000), body: JSON.stringify({title, body: `The official Windows nightly feed reports DSH **${version}**. The last observed installed version is **${baseline}**.\n\nRun the installed compatibility report and the native runtime fixtures against this release before changing peer dependency declarations or deploying extensions. Test bot/session lifecycles, tool permissions, client slots, and storage contracts. This notification does not certify compatibility.\n\nSource: ${FEED}`})});
  if (!created.ok) throw Error(`GitHub issue creation returned ${created.status}`);
  return {...result, issue: (await created.json()).html_url};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await monitor({baseline: '0.2.2-rc.5', token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY}), null, 2));
}
