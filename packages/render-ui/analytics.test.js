import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {normalizeOpenUi} from './lib/openui-validate.js';
import {library} from './lib/openui-library-build.mjs';
import {analyticsFixture,analyticsExample,statusFixture} from './src/analytics-fixture.js';
import {validateAnalyticsData} from './src/analytics-schema.js';
import {askAboutPullRequest} from './src/analytics-actions.js';

test('new dashboard and status components validate in the standard library',()=>{
  assert.equal(normalizeOpenUi(analyticsExample,'Engineering').lang,analyticsExample);
  assert.equal(normalizeOpenUi(analyticsExample.replace('"review_pr"','null'),'Draft').view,'openui');
  assert.ok(library.components.AnalyticsDashboard && library.components.StatusBars);
  const live=analyticsExample.replace('data = '+JSON.stringify(analyticsFixture),'data = Query("engineering_data", {}, '+JSON.stringify(analyticsFixture)+')');
  assert.equal(normalizeOpenUi(live,'Live data').lang,live);
});
test('dashboard data rejects broken author references, unbounded arrays and unsafe styling',()=>{
  assert.ok(validateAnalyticsData(analyticsFixture).data);
  const bad=structuredClone(analyticsFixture);bad.pullRequests[0].author='unknown';
  assert.match(validateAnalyticsData(bad).error,/author/);
  bad.pullRequests=Array(201).fill(analyticsFixture.pullRequests[0]);
  assert.ok(validateAnalyticsData(bad).error);
  const color=structuredClone(analyticsFixture);color.people[0].color='url(https://example.org/tracker)';
  assert.ok(validateAnalyticsData(color).error);
});
test('status history does not claim unknown days are healthy',()=>{
  const html=renderToStaticMarkup(React.createElement(library.components.StatusBars.component,{props:{label:'Builds',days:statusFixture,mock:true}}));
  assert.match(html,/2026-11-11: No data/);assert.match(html,/Example data/);
  const invalid=renderToStaticMarkup(React.createElement(library.components.StatusBars.component,{props:{label:'Builds',days:'bad'}}));
  assert.match(invalid,/valid observations/);
});
test('assistant calls only the requested session tool or explicitly drafts for source-chat review',async()=>{
  const calls=[]; const pr=analyticsFixture.pullRequests[0];
  const answer=await askAboutPullRequest({tool:async(...args)=>{calls.push(args);return {answer:'Focus restored'};}},'review_pr','Explain',pr);
  assert.equal(answer,'Focus restored');assert.deepEqual(calls[0],['review_pr',{question:'Explain',pullRequest:{number:101,repository:'acme/web',title:pr.title}}]);
  const drafts=[];
  assert.match(await askAboutPullRequest({draft:async text=>drafts.push(text)},undefined,'Explain',pr),/press Send/);
  assert.equal(drafts[0],'About acme/web PR #101: Explain');
  await assert.rejects(()=>askAboutPullRequest({disabled:true,tool:()=>assert.fail()},'review_pr','Explain',pr),/source chat/);
  await assert.rejects(()=>askAboutPullRequest({tool:async()=>({})},'review_pr','Explain',pr),/return text/);
});
