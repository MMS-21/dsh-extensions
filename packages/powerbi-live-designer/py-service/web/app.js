const $ = (id) => document.getElementById(id);
let lastVersion = -1;
let active = false;
let lastAuto = 0;
let currentPlanId = null;

function setBusy(busy) {
  active = busy;
  document.querySelectorAll('button').forEach(b => b.disabled = busy);
  $('indicator').textContent = busy ? 'Working...' : 'Ready';
  $('indicator').className = busy ? 'pill busy' : 'pill';
}

function applyState(s) {
  $('project').textContent = s.project || 'No project';
  $('diagnostics').textContent = s.lastResult || '';
  $('runRefresh').disabled = active || !currentPlanId || !s.refreshPlan?.executable || !s.modelAdapterConfigured;
  if (s.hasImage) {
    $('empty').hidden = true;
    if (s.captureVersion !== lastVersion) {
      lastVersion = s.captureVersion;
      $('shot').src = `/api/image?v=${s.captureVersion}`;
    }
    $('shot').hidden = false;
    $('captured').textContent = `Latest screenshot version: ${s.captureVersion}. Last operation: ${s.lastAction} (${s.lastAt || 'unknown'})`;
  } else {
    $('shot').hidden = true;
    $('empty').hidden = false;
    $('captured').textContent = 'No screenshot captured';
  }
}

async function fetchState() {
  try {
    const r = await fetch('/api/state', {cache: 'no-store'});
    const j = await r.json();
    if (j.ok) applyState(j.state);
  } catch (err) { $('indicator').textContent = 'Disconnected'; }
}

async function action(name) {
  if (active) return;
  if (name === 'reload' && !confirm('Validate and reload the PBIR from disk? Unsaved Desktop changes will block this action.')) return;
  if (name === 'attach' && !confirm('Attach/open the matching Desktop project? This runs only after a safe status check.')) return;
  setBusy(true);
  try {
    const body = name === 'capture' ? {page: $('pageId').value.trim()} : {};
    const r = await fetch(`/api/${name}`, {
      method: 'POST', headers: {'Content-Type':'application/json','X-PBI-Live-Designer':'1'},
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.state) applyState(j.state);
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  } catch (err) {
    $('diagnostics').textContent = `ERROR: ${err.message}`;
    if (name !== 'capture') alert(err.message);
  } finally {
    setBusy(false);
    await fetchState();
  }
}

document.querySelectorAll('button[data-action]').forEach(b => b.addEventListener('click', () => action(b.dataset.action)));
setInterval(() => {
  if (!active) fetchState();
  if ($('autoCapture').checked && !active && Date.now() - lastAuto >= 20000) {
    lastAuto = Date.now();
    action('capture');
  }
}, 2500);
fetchState();

function buildManifest() {
  const kind = $('changeKind').value;
  const tables = $('affectedTables').value.split(',').map(s => s.trim()).filter(Boolean);
  const query = $('daxCheck').value.trim();
  const change = {kind};
  if (['source_data','m_expression'].includes(kind)) {
    change.tables = tables;
    change.storage = 'Import';
    change.lineageVerified = $('verifiedLineage').checked;
  }
  if (kind === 'measure') change.fileEdit = true;
  return {refreshPolicy:'smart', refreshScope:'affected', verifyDax:true, verifyScreenshots:true,
          tmdlValidated:$('validatedTmdl').checked,
          changes:[change], daxQueries:query ? [query] : [], screenshotPages:$('pageId').value.trim()?[$('pageId').value.trim()]:[]};
}

$('planRefresh').addEventListener('click', async () => {
  if (active) return;
  currentPlanId = null;
  setBusy(true);
  try {
    const r = await fetch('/api/refresh/plan', {method:'POST', headers:{'Content-Type':'application/json','X-PBI-Live-Designer':'1'},body:JSON.stringify(buildManifest())});
    const j = await r.json();
    if (!r.ok || !j.ok) throw Error(j.error || 'Plan failed');
    currentPlanId = j.planId;
    $('refreshPlan').textContent = JSON.stringify(j.plan, null, 2);
    applyState(j.state);
  } catch(e) { $('refreshPlan').textContent = 'ERROR: '+e.message; }
  finally { setBusy(false); await fetchState(); }
});
$('runRefresh').addEventListener('click', async () => {
  if (active || !currentPlanId) return;
  if (!confirm('Run the reviewed refresh plan? Make a backup first. Processing may change the live Desktop model.')) return;
  setBusy(true);
  try {
    const r = await fetch('/api/refresh/run', {method:'POST', headers:{'Content-Type':'application/json','X-PBI-Live-Designer':'1'},body:JSON.stringify({planId:currentPlanId,approved:true})});
    const j = await r.json();
    if (j.state) applyState(j.state);
    if (!r.ok || !j.ok) throw Error(j.error || `HTTP ${r.status}`);
    $('refreshPlan').textContent = `${j.message}

MCP observations (review values):
`+JSON.stringify(j.observations,null,2);
  } catch(e) { $('refreshPlan').textContent = 'BLOCKED/FAILED: '+e.message; }
  finally { currentPlanId=null; setBusy(false); await fetchState(); }
});
