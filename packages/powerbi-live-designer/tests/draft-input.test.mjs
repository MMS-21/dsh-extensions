import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadDraftInput} from '../draft-input.mjs';
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'pbi-draft-input-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const workspace=join(root,'workspace'),project=join(root,'project','Report.pbip');mkdirSync(workspace);mkdirSync(join(root,'project'));writeFileSync(project,'{}');
 const path=join(workspace,'draft.json'),contentPath=join(workspace,'page.json');writeFileSync(contentPath,'{"title":"Revenue €"}');
 const draft={plan:{},changes:{summary:'Generated definitions',files:[{path:'Report.Report/definition/pages/p/page.json',contentPath:'page.json',beforeSha256:null}]},pages:['p'],acceptance:['Actual revenue reconciles']};
 const save=()=>writeFileSync(path,JSON.stringify(draft));save();
 return {root,workspace,project,path,contentPath,draft,save,load:input=>loadDraftInput(input??{manifestPath:path},{workspace,project})};
}
test('one manifest path loads exact UTF-8 definitions and returns a compact receipt',t=>{
 const f=fixture(t),result=f.load();assert.equal(result.changes.files[0].content,'{"title":"Revenue €"}');assert.equal(result.changes.files[0].beforeSha256,null);assert.equal(Object.hasOwn(result.changes.files[0],'contentPath'),false);
 assert.equal(result.draftSource.fileCount,1);assert.equal(result.draftSource.manifestSha256,createHash('sha256').update(readFileSync(f.path)).digest('hex'));
 writeFileSync(f.contentPath,'changed later');assert.equal(result.changes.files[0].content,'{"title":"Revenue €"}');
});
test('inline drafts retain compatibility and can reference workspace-relative generated files',t=>{
 const f=fixture(t);assert.equal(f.load(f.draft).draftSource.mode,'file-references');
 f.draft.changes.files[0]={path:'Report.Report/page.json',content:'{}',beforeSha256:null};assert.equal(f.load(f.draft).draftSource.mode,'inline');
});
test('checksums and explicit baseline hashes are retained and verified',t=>{
 const f=fixture(t);const file=f.draft.changes.files[0];file.beforeSha256='a'.repeat(64);file.contentSha256=createHash('sha256').update(readFileSync(f.contentPath)).digest('hex');f.save();assert.equal(f.load().changes.files[0].beforeSha256,'a'.repeat(64));
 writeFileSync(f.contentPath,'{}');assert.throws(()=>f.load(),/checksum changed/);
 delete file.contentSha256;delete file.beforeSha256;f.save();assert.throws(()=>f.load(),/beforeSha256/);
});
test('manifest and content paths cannot escape permitted roots or follow junctions',t=>{
 const f=fixture(t);const outside=join(f.root,'outside');mkdirSync(outside);writeFileSync(join(outside,'page.json'),'{}');
 assert.throws(()=>f.load({manifestPath:join(outside,'page.json')}),/must stay inside/);
 f.draft.changes.files[0].contentPath='../outside/page.json';f.save();assert.throws(()=>f.load(),/must stay inside/);
 const link=join(f.workspace,'link');symlinkSync(outside,link,'junction');f.draft.changes.files[0].contentPath='link/page.json';f.save();assert.throws(()=>f.load(),/Linked draft|symbolic links/);
});
test('ambiguous inputs, invalid encoding, duplicate targets and traversal fail before staging',t=>{
 const f=fixture(t);assert.throws(()=>f.load({manifestPath:f.path,...f.draft}),/do not mix/);
 f.draft.changes.files[0].content='{}';f.save();assert.throws(()=>f.load(),/exactly one/);delete f.draft.changes.files[0].content;
 writeFileSync(f.contentPath,Buffer.from([0xff]));f.save();assert.throws(()=>f.load(),/UTF-8/);writeFileSync(f.contentPath,'{}');
 f.draft.changes.files.push({...f.draft.changes.files[0]});f.save();assert.throws(()=>f.load(),/Duplicate/);f.draft.changes.files.pop();
 f.draft.changes.files[0].path='../escape.json';f.save();assert.throws(()=>f.load(),/contained project-relative/);
});
test('oversized or malformed manifests and definitions are rejected',t=>{
 const f=fixture(t);writeFileSync(f.path,'{bad');assert.throws(()=>f.load(),/valid JSON/);
 writeFileSync(f.path,'null');assert.throws(()=>f.load(),/JSON object/);f.save();
 writeFileSync(f.contentPath,'x'.repeat(250001));assert.throws(()=>f.load(),/size budget/);
 writeFileSync(f.path,' '.repeat(2000001));assert.throws(()=>f.load(),/size budget/);
});
test('revision metadata and backslash targets normalize without changing content',t=>{
 const f=fixture(t);f.draft.changes.files[0].path='Report.SemanticModel\\definition\\model.tmdl';f.save();const result=f.load({manifestPath:f.path,revisionOf:'b'.repeat(64)});assert.equal(result.revisionOf,'b'.repeat(64));assert.equal(result.changes.files[0].path,'Report.SemanticModel/definition/model.tmdl');
 f.draft.revisionOf='c'.repeat(64);f.save();assert.throws(()=>f.load({manifestPath:f.path,revisionOf:'b'.repeat(64)}),/Conflicting/);
});

test('aggregate and JSON wire budgets are enforced for local file batches',t=>{
 const f=fixture(t);const original=f.draft.changes.files[0];writeFileSync(f.contentPath,'x'.repeat(249000));
 f.draft.changes.files=Array.from({length:7},(_,i)=>({...original,path:'Report.Report/file'+i+'.tmdl'}));f.save();assert.throws(()=>f.load(),/content budget/);
 writeFileSync(f.contentPath,'\u0001'.repeat(200000));f.draft.changes.files=f.draft.changes.files.slice(0,2);f.save();assert.throws(()=>f.load(),/coordinator request budget/);
});
