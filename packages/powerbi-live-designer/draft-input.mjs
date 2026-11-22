import {openSync,closeSync,fstatSync,readSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,join,win32} from 'node:path';
import {createHash} from 'node:crypto';
const fail=message=>Object.assign(new Error(message),{code:'DRAFT_INPUT_INVALID'});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const within=(root,path)=>{const part=relative(root,path);return part===''||(!part.split(/[\\/]/).includes('..')&&!isAbsolute(part));};
const keys=(value,allowed)=>{if(!record(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw fail('Unexpected draft fields; use the documented manifest schema.');};
/** Resolve local text inputs before any planning, staging or task-history mutation. */
export function loadDraftInput(input,{project,workspace,taskDirectory,schema}={}){
  if(!record(input))throw fail('Draft input must be an object.');
  const roots=[workspace,project&&dirname(project),taskDirectory].filter(Boolean).map(path=>resolve(path));
  const base=workspace??(project&&dirname(project));
  if(!base)throw fail('A prepared project or session workspace is required.');
  function read(path,limit){
    const absolute=resolve(path);const root=roots.filter(r=>within(r,absolute)).sort((a,b)=>b.length-a.length)[0];
    if(!root)throw fail('Draft input must stay inside the session workspace, project directory or task directory.');
    const actualRoot=realpathSync(root),actual=realpathSync(absolute);
    if(!within(actualRoot,actual))throw fail('Linked draft input escapes its allowed directory.');
    let current=root;
    for(const part of relative(root,absolute).split(/[\\/]/).filter(Boolean)){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw fail('Draft inputs cannot use symbolic links or junctions.');}
    const fd=openSync(absolute,'r');
    try{
      const before=fstatSync(fd);if(!before.isFile()||before.size>limit)throw fail('Draft input must be a regular file within its size budget.');
      const bytes=Buffer.alloc(limit+1);let size=0;
      while(size<bytes.length){const count=readSync(fd,bytes,size,bytes.length-size,null);if(!count)break;size+=count;}
      const after=fstatSync(fd);
      if(size>limit||after.size!==before.size||after.mtimeMs!==before.mtimeMs||size!==before.size)throw fail('Draft input changed while reading or exceeded its size budget.');
      const data=bytes.subarray(0,size);let text;
      try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);}catch{throw fail('Draft inputs must contain valid UTF-8 text.');}
      return {path:absolute,text,sha256:sha(data)};
    }finally{closeSync(fd);}
  }
  let draft=input,sourceBase=resolve(base),manifest;
  if(input.manifestPath!==undefined){
    if(Object.keys(input).some(key=>!['manifestPath','revisionOf'].includes(key)))throw fail('Use manifestPath alone, with optional revisionOf; do not mix inline draft fields.');
    if(typeof input.manifestPath!=='string'||!isAbsolute(input.manifestPath))throw fail('manifestPath must be an absolute local JSON path.');
    manifest=read(input.manifestPath,2_000_000);sourceBase=dirname(manifest.path);
    try{draft=JSON.parse(manifest.text.replace(/^\uFEFF/,''));}catch{throw fail('Draft manifest is not valid JSON.');}
    if(!record(draft))throw fail('Draft manifest must contain a JSON object.');
    if(input.revisionOf!==undefined){if(draft.revisionOf!==undefined&&draft.revisionOf!==input.revisionOf)throw fail('Conflicting draft revision digests.');draft={...draft,revisionOf:input.revisionOf};}
  }
  if(schema)validateDraftSchema(draft,schema);
  keys(draft,['plan','changes','pages','acceptance','checks','refresh','revisionOf']);
  if(!record(draft.plan)||!record(draft.changes)||!Array.isArray(draft.pages)||!Array.isArray(draft.acceptance))throw fail('Draft requires plan, changes, pages and acceptance.');
  keys(draft.changes,['summary','files']);
  if(typeof draft.changes.summary!=='string'||!draft.changes.summary.trim()||draft.changes.summary.length>2000)throw fail('Draft summary must contain 1–2000 characters.');
  if(!Array.isArray(draft.changes.files)||!draft.changes.files.length||draft.changes.files.length>200)throw fail('Draft requires 1–200 definition files.');
  let total=0;const targets=new Set();
  const files=draft.changes.files.map(file=>{
    keys(file,['path','content','contentPath','beforeSha256','contentSha256']);
    if(typeof file.path!=='string'||!file.path||file.path.length>500)throw fail('Every definition needs a relative target path.');
    const path=file.path.replaceAll('\\','/');
    if(win32.isAbsolute(path)||isAbsolute(path)||path.includes(':')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw fail('Definition target must be a contained project-relative path.');
    if(targets.has(path.toLowerCase()))throw fail('Duplicate definition target.');targets.add(path.toLowerCase());
    if(file.beforeSha256!==null&&(typeof file.beforeSha256!=='string'||!/^([a-f0-9]{64})$/.test(file.beforeSha256)))throw fail('Every definition needs beforeSha256, or null for a new file.');
    if(Object.hasOwn(file,'content')===Object.hasOwn(file,'contentPath'))throw fail('Each definition needs exactly one of content or contentPath.');
    if(Object.hasOwn(file,'content')&&typeof file.content!=='string')throw fail('Inline definition content must be text.');
    let content=file.content,hash;
    if(file.contentPath!==undefined){if(typeof file.contentPath!=='string'||!file.contentPath)throw fail('contentPath must name a local file.');const loaded=read(resolve(sourceBase,file.contentPath),250_000);content=loaded.text;hash=loaded.sha256;}
    else hash=sha(Buffer.from(content,'utf8'));
    if(file.contentSha256!==undefined&&file.contentSha256!==hash)throw fail('Generated definition checksum changed; regenerate or inspect the manifest.');
    total+=Buffer.byteLength(content,'utf8');if(Buffer.byteLength(content,'utf8')>250_000||total>1_500_000)throw fail('Draft content budget exceeded (250 KB per file, 1.5 MB total).');
    return {path,content,beforeSha256:file.beforeSha256};
  });
  // Match the coordinator HTTP budget, including JSON escape expansion.
  if(Buffer.byteLength(JSON.stringify({value:{...draft.changes,files},sessionId:'x'.repeat(500),planId:'x'.repeat(32)}),'utf8')>1_990_000)throw fail('Serialized draft exceeds the coordinator request budget; reduce or split the draft.');
  return {...draft,changes:{...draft.changes,files},draftSource:{mode:manifest?'manifest':files.some((_,i)=>draft.changes.files[i].contentPath!==undefined)?'file-references':'inline',...(manifest?{manifestPath:manifest.path,manifestSha256:manifest.sha256}:{}),fileCount:files.length,contentBytes:total}};
}
/** Validate disk manifests against the same bounded schema exposed by the tool. */
export function validateDraftSchema(value,schema,path='$'){
 const reject=()=>{throw fail(`Draft manifest does not match the tool schema at ${path}.`);};
 if(schema.anyOf){if(!schema.anyOf.some(branch=>{try{validateDraftSchema(value,branch,path);return true;}catch{return false;}}))reject();}
 if(schema.oneOf){if(schema.oneOf.filter(branch=>{try{validateDraftSchema(value,branch,path);return true;}catch{return false;}}).length!==1)reject();}
 if(schema.enum&&!schema.enum.includes(value))reject();
 if(schema.type){const valid=schema.type==='object'?record(value):schema.type==='array'?Array.isArray(value):schema.type==='null'?value===null:schema.type==='integer'?Number.isSafeInteger(value):schema.type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===schema.type;if(!valid)reject();}
 if(typeof value==='string'){if(schema.minLength!==undefined&&value.length<schema.minLength||schema.maxLength!==undefined&&value.length>schema.maxLength||schema.pattern&&!new RegExp(schema.pattern).test(value))reject();}
 if(typeof value==='number'){if(!Number.isFinite(value)||schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)reject();}
 if(Array.isArray(value)){if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems||schema.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length)reject();if(schema.items)value.forEach((item,index)=>validateDraftSchema(item,schema.items,path+'['+index+']'));}
 if(record(value)){for(const key of schema.required??[])if(!Object.hasOwn(value,key))reject();if(schema.additionalProperties===false&&Object.keys(value).some(key=>!Object.hasOwn(schema.properties??{},key)))reject();for(const [key,child] of Object.entries(schema.properties??{}))if(Object.hasOwn(value,key))validateDraftSchema(value[key],child,path+'.'+key);}
 return value;
}
