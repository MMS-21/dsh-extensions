import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,resolve,relative,isAbsolute,join} from 'node:path';
export function projectSnapshot(project){
  const root=realpathSync(dirname(project));const files=[];let bytes=0;
  function contained(path){const part=relative(root,path);if(part.startsWith('..')||isAbsolute(part))throw Error('Project reference escapes its directory');return path;}
  function visit(path){
    const normalize=value=>process.platform==='win32'?value.toLowerCase():value;
    const info=lstatSync(path);if(info.isSymbolicLink()||normalize(realpathSync(path))!==normalize(resolve(path)))throw Error('Linked project definitions cannot establish a stable snapshot');
    if(info.isDirectory()){for(const item of readdirSync(path)){if(item!=='.pbi')visit(join(path,item));}return;}
    if(!info.isFile())throw Error('Project definition must be a regular file');
    if(files.length>=10000||(bytes+=info.size)>32_000_000)throw Error('Project snapshot exceeds its budget');
    files.push([relative(root,path),createHash('sha256').update(readFileSync(path)).digest('hex')]);
  }
  visit(project);const descriptor=JSON.parse(readFileSync(project,'utf8').replace(/^\uFEFF/,''));
  const reports=(descriptor.artifacts??[]).flatMap(a=>a.report?.path?[a.report.path]:[]);
  if(reports.length!==1)throw Error('Expected one report in the project');
  const report=contained(resolve(root,reports[0]));visit(report);
  const definition=JSON.parse(readFileSync(join(report,'definition.pbir'),'utf8').replace(/^\uFEFF/,''));
  const model=definition.datasetReference?.byPath?.path;if(model)visit(contained(resolve(report,model)));
  return createHash('sha256').update(JSON.stringify(files.sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
}
