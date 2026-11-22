import {toolJson} from './tool-json.mjs';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DESIGN_SKILLS} from './task-store.mjs';
const identity=result=>({id:result.id,digest:result.digest});
const failure=(message,code)=>Object.assign(Error(message),{code});
export class Workflow {
  constructor(store,adapter){this.store=store;this.adapter=adapter;}
  status(session){
    const stored=this.store.read(session);if(!stored)return {ok:true,task:null,paths:this.store.paths(session)};
    // Keep full recovery context on disk; return compact evidence, not complete diffs.
    const {id,intent,mode,project,phase,nextAction,blocker,designSkills,capabilities,acceptance,pages,change,savePolicy,draftSource}=stored;
    const steps=Object.fromEntries(Object.entries(stored.steps).map(([name,step])=>{
      const result=step.result??{};const visible={};
      for(const key of ['id','digest','status','reloadOutcome','path','sha256','requestedPage','actual','expected','tolerance','passed','observations','postCanvasVerification'])if(result[key]!==undefined)visible[key]=result[key];
      return [name,{outcome:step.outcome,code:step.code,attempt:step.attempt,result:visible}];
    }));
    return toolJson({ok:true,task:{id,intent,mode,project,phase:phase==='awaiting_approval'?'ready_to_execute':phase,nextAction:phase==='awaiting_approval'?'Continue with pbi_execute_task; ask unresolved questions in chat.':nextAction,blocker,designSkills,capabilities,acceptance,pages,change,savePolicy,draftSource,steps,history:(stored.history??[]).map(h=>({change:h.change,phase:h.phase}))},paths:this.store.paths(session)});
  }
  async prepare(session,input){return this.store.exclusive(session,async()=>{
    let task=this.store.read(session);
    if(task&&task.phase!=='blocked'){
      if(input.project&&task.project&&this.adapter.normalize(input.project)!==this.adapter.normalize(task.project))throw failure('This chat already owns another project. Start a separate task.','PROJECT_CHANGED');
      if(task.connection&&this.adapter.resume){const resumed=await this.adapter.resume(task);task.connection=resumed.connection;task.capabilities=resumed.capabilities;this.store.write(session,task);await this.adapter.bind(task);}
      return {ok:true,resumed:true,...this.status(session)};
    }
    if(!input.intent?.trim())throw failure('Describe the requested report work.','INTENT_REQUIRED');
    if(task?.change)throw failure('An existing draft must be reconciled before preparation can change.','DRAFT_EXISTS');
    task={id:task?.id??randomUUID(),intent:input.intent,mode:input.mode??'existing',project:input.project??null,sources:input.sources??[],savePolicy:input.savePolicy??'automatic',designSkills:[...DESIGN_SKILLS],createdAt:task?.createdAt??new Date().toISOString(),phase:'preparing',steps:{},acceptance:[],artifacts:[],nextAction:null};
    this.store.write(session,task);
    try{
      const prepared=await this.adapter.prepare(input);
      task.project=prepared.project;task.capabilities=prepared.capabilities;task.connection=prepared.connection;task.phase='prepared';task.nextAction='Inspect the model and source data, then use the bundled design skills to prepare the draft.';
      this.store.write(session,task);await this.adapter.bind(task);return this.status(session);
    }catch(error){task.phase='blocked';task.nextAction=error.message;task.blocker=error.code??'PREPARATION_FAILED';this.store.write(session,task);return {ok:false,...this.status(session),ok:false};}
  });}
  async inspect(session){const task=this.required(session);await this.adapter.bind(task);return this.adapter.inspect(task);}
  required(session){const task=this.store.read(session);if(!task)throw failure('Prepare this task first.','TASK_REQUIRED');return task;}
  async draft(session,input){return this.store.exclusive(session,async()=>{
    const task=this.required(session);
    if(Object.values(task.steps).some(s=>['dispatching','unknown'].includes(s.outcome)))throw failure('Reconcile unfinished operations before changing the draft.','OUTCOME_UNKNOWN');
    if(this.adapter.loadDraft)input=await this.adapter.loadDraft(task,input);
    if(task.change){
      if(input.revisionOf!==task.change.digest)throw failure('Supply revisionOf with the current draft digest to prepare a reviewed correction.','DRAFT_EXISTS');
      task.history=[...(task.history??[]),{change:task.change,phase:task.phase,steps:task.steps}];
      if(task.history.length>20)throw failure('Task revision budget reached. Preserve its context and begin a new task.','REVISION_LIMIT');
      task.steps={};delete task.change;delete task.verificationSnapshot;task.visualReviews=[];
    }
    if(!input.pages?.length||input.pages.length>50||input.pages.some(p=>!/^[-A-Za-z0-9_]{1,100}$/.test(p))||new Set(input.pages).size!==input.pages.length||!input.acceptance?.length)throw failure('Provide unique affected page IDs and task-specific acceptance checks.','ACCEPTANCE_REQUIRED');
    if(input.changes?.files?.some(f=>f.path.includes('.SemanticModel/'))&&!input.checks?.length)throw failure('Model changes require at least one bounded numerical acceptance query.','MODEL_CHECK_REQUIRED');
    await this.adapter.bind(task);
    const plan=await this.adapter.plan(input.plan);
    task.draftSource=input.draftSource;task.plan=plan;task.pages=input.pages;task.acceptance=input.acceptance;task.refresh=input.refresh??null;task.checks=input.checks??[];task.phase='drafting';this.store.write(session,task);
    // Save the ID immediately after staging, before validation. A lost acknowledgment is unknown.
    await this.step(session,task,'stage',()=>this.adapter.stage({...input.changes,planId:plan.id??plan.planId}),r=>!!r.id&&!!r.digest);
    task.change=identity(task.steps.stage.result);this.store.write(session,task);
    await this.step(session,task,'validate',()=>this.adapter.validate(task.change),r=>r.status==='validated'||r.validation?.passed===true);
    task.phase='ready_to_execute';task.nextAction='Continue execution of this validated draft. Ask any unresolved business questions in chat.';this.store.write(session,task);
    return this.status(session);
  });}
  async step(session,task,name,work,accept=()=>true){
    const previous=task.steps[name];
    if(previous?.outcome==='succeeded')return previous.result;
    if(previous&&['dispatching','unknown'].includes(previous.outcome))throw failure(`The ${name} outcome needs reconciliation; it will not be repeated.`,'OUTCOME_UNKNOWN');
    const readOnly=name==='validate'||name.startsWith('query_')||name.startsWith('capture_');
    const attempt=(previous?.attempt??0)+1;if(attempt>2)throw failure(`The ${name} retry budget is exhausted. Inspect the concrete error or prepare a corrected draft.`,'RETRY_LIMIT');
    const operationId=randomUUID();task.steps[name]={outcome:'dispatching',operationId,attempt};this.store.write(session,task);this.store.event(session,{taskId:task.id,operationId,stage:name,outcome:'dispatching'});
    try{
      const result=await work();
      if(result?.ok===false||!accept(result))throw failure(`The ${name} result did not satisfy its completion check.`,'CHECK_FAILED');
      task.steps[name]={outcome:'succeeded',operationId,attempt,result};this.store.write(session,task);this.store.event(session,{taskId:task.id,operationId,stage:name,outcome:'succeeded'});return result;
    }catch(error){
      // Transport exceptions may follow a committed mutation. Never automatically replay.
      const outcome=readOnly?'failed':'unknown';
      task.steps[name]={outcome,operationId,attempt,code:error.code??'OPERATION_UNCERTAIN'};task.phase=readOnly?'verification_failed':'needs_reconciliation';task.nextAction=`Inspect the recorded ${name} operation and actual project state before resuming.`;this.store.write(session,task);this.store.event(session,{taskId:task.id,operationId,stage:name,outcome,code:error.code});throw error;
    }
  }
  async execute(session){return this.store.exclusive(session,()=>this.store.exclusive('project:'+this.adapter.normalize(this.required(session).project),async()=>{
    const task=this.required(session);if(!task.change)throw failure('Prepare and validate a draft first.','DRAFT_REQUIRED');await this.adapter.bind(task);
    let current=await this.adapter.get(task.change);
    if(current.digest!==task.change.digest)throw failure('The reviewed draft changed. Approval must be renewed.','APPROVAL_STALE');
    if(current.status==='validated'){
      await this.step(session,task,'authorize',()=>this.adapter.authorize(task.change),r=>r.status==='approved'&&r.approval?.digest===task.change.digest&&r.approval?.source==='task-workflow');
      current=await this.adapter.get(task.change);
    }
    if(!['approved','applied'].includes(current.status)||current.approval?.digest!==task.change.digest||!['task-workflow','native-user-command'].includes(current.approval?.source))throw failure('The exact validated draft is not authorized for execution. Inspect task status.','DRAFT_NOT_AUTHORIZED');
    // Backend readback is authoritative for interrupted application/reload, not the host journal.
    if(['approved','applied'].includes(current.status)&&current.approval?.digest===task.change.digest)task.steps.authorize={outcome:'succeeded',result:current};
    if(current.status==='applied')task.steps.apply={outcome:'succeeded',result:current};
    if(current.reloadOutcome==='succeeded')task.steps.reload={outcome:'succeeded',result:current};
    this.store.write(session,task);
    await this.step(session,task,'apply',()=>this.adapter.apply(task.change),r=>r.status==='applied');
    await this.step(session,task,'reload',()=>this.adapter.reload(task.change),r=>r.reloadOutcome==='succeeded');
    if(task.refresh){
      await this.step(session,task,'stage_refresh',()=>this.adapter.stageRefresh({...task.refresh,changeSetId:task.change.id}),r=>!!r.id&&!!r.digest);
      const refresh=identity(task.steps.stage_refresh.result);
      const observed=await this.adapter.getRefresh(refresh);
      if(observed.status==='verified'&&observed.postCanvasVerification?.verified===true)task.steps.refresh={outcome:'succeeded',result:observed};
      else if(['unknown','running','verification-failed'].includes(observed.status))throw failure('Refresh requires inspection; completed imports will not be repeated.','REFRESH_UNCERTAIN');
      await this.step(session,task,'refresh',()=>this.adapter.refresh(refresh),r=>r.status==='verified'&&r.postCanvasVerification?.verified===true);
    }
    const snapshot=await this.adapter.snapshot(task);
    if(task.verificationSnapshot&&task.verificationSnapshot!==snapshot){
      for(const name of Object.keys(task.steps))if(name.startsWith('query_')||name.startsWith('capture_'))delete task.steps[name];
      task.visualReviews=[];
    }
    task.verificationSnapshot=snapshot;this.store.write(session,task);
    for(let i=0;i<task.checks.length;i++)await this.step(session,task,`query_${i}`,()=>this.adapter.query(task,task.checks[i]),r=>r.passed===true);
    for(const page of task.pages)await this.step(session,task,`capture_${page}`,()=>this.adapter.capture(task,page),r=>r.rendererAcknowledged===true&&r.path&&r.sha256);
    task.phase='awaiting_visual_review';task.nextAction='Read each captured image and record the design review against its exact image hash; verify saved output before marking complete.';this.store.write(session,task);return this.status(session);
  }));}
  async refreshData(session,tables){return this.store.exclusive(session,()=>this.store.exclusive('project:'+this.adapter.normalize(this.required(session).project),async()=>{
    const task=this.required(session);
    if(task.change)throw failure('Use the approved draft execution for its affected-table refresh.','DRAFT_REFRESH_REQUIRED');
    if(!Array.isArray(tables)||!tables.length||tables.length>20||tables.some(t=>typeof t!=='string'||!t.trim())||new Set(tables).size!==tables.length)throw failure('Choose 1–20 unique model tables.','TABLES_REQUIRED');
    if(task.refreshTables&&JSON.stringify(task.refreshTables)!==JSON.stringify(tables))throw failure('The task refresh scope changed. Start a new task rather than replaying a different import.','SCOPE_CHANGED');
    await this.adapter.bind(task);task.refreshTables=tables;this.store.write(session,task);
    const result=await this.step(session,task,'direct_refresh',()=>this.adapter.refreshData(task,tables),r=>r.ok===true&&r.completed?.length===tables.length&&r.observations?.length===tables.length);
    task.phase='data_refreshed';task.nextAction='Report observed row counts. Data refresh alone does not verify business measures, report appearance or saved output.';this.store.write(session,task);return {ok:true,result,...this.status(session)};
  }));}
  async finish(session,reviews){return this.store.exclusive(session,()=>this.store.exclusive('project:'+this.adapter.normalize(this.required(session).project),async()=>{
    const task=this.required(session);
    const reconcileSave=task.phase==='needs_reconciliation'&&['unknown','dispatching'].includes(task.steps.save?.outcome)&&!Object.entries(task.steps).some(([name,step])=>name!=='save'&&['unknown','dispatching'].includes(step.outcome));
    if(!['awaiting_visual_review','awaiting_save'].includes(task.phase)&&!reconcileSave)throw failure('Complete execution and page capture before final review.','REVIEW_NOT_READY');
    for(const page of task.pages){
      const capture=task.steps[`capture_${page}`]?.result;
      const review=reviews.find(r=>r.page===page);
      if(!capture||!review||review.sha256!==capture.sha256||review.passed!==true||!review.notes?.trim())throw failure('Every affected page needs a passing review of its current captured hash.','VISUAL_REVIEW_REQUIRED');
      if(createHash('sha256').update(readFileSync(capture.path)).digest('hex')!==capture.sha256)throw failure('A captured artifact changed; visual evidence is stale.','EVIDENCE_CHANGED');
    }
    await this.adapter.bind(task);const ready=await this.adapter.readiness(task);
    if(await this.adapter.snapshot(task)!==task.verificationSnapshot)throw failure('Definitions changed after verification. Execute again to recheck queries and captures; completed imports will not be replayed.','EVIDENCE_STALE');
    task.visualReviews=reviews;
    let saved=ready.checks?.desktopAccessible===true&&ready.checks?.unsavedChanges===false;
    if(saved&&task.steps.save&&['unknown','dispatching'].includes(task.steps.save.outcome))task.steps.save={outcome:'succeeded',result:{saved:true,reconciled:true,snapshot:task.verificationSnapshot}};
    if(!saved&&ready.checks?.desktopAccessible===true&&ready.checks?.unsavedChanges===true&&task.savePolicy==='automatic'&&task.capabilities?.automaticSave===true){
      const result=await this.step(session,task,'save',()=>this.adapter.save(task),r=>r.saved===true);
      saved=true;
      if(result.snapshot!==task.verificationSnapshot){task.phase='needs_reverification';task.nextAction='Desktop saved and normalized the project files. Execute again to recheck current queries and images without repeating acknowledged imports.';this.store.write(session,task);return this.status(session);}
    }
    if(!saved){task.phase='awaiting_save';task.nextAction='Save the exact open Power BI project, then finish the existing task. Captures and completed refreshes are preserved.';}
    else{task.phase='verified';task.nextAction='Report verified evidence and the saved project location. Scalar checks, screenshots and agent review have passed; task-specific business assumptions remain documented.';}
    this.store.write(session,task);return this.status(session);
  }));}
}
