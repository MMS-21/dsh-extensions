(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const text = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  let sequence = 0;
  const pending = new Map();
  window.addEventListener('message', ({source, data}) => {
    if (source !== parent || data?.channel !== 'pbi-v6-response') return;
    const reply = pending.get(data.id);
    if (reply) reply(data);
  });
  function request(op, value) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('DSH did not confirm the outcome. Check the operation journal before retrying an action.'));
      }, ['task','performance','navigate'].includes(op) ? 4000 : 180000);
      pending.set(id, data => {
        clearTimeout(timer);
        pending.delete(id);
        if (data.error) reject(Error(data.error));
        else resolve(data.value);
      });
      parent.postMessage({channel:'pbi-v6-request', id, op, value}, '*');
    });
  }
  function button(label, action, status, kind = 'primary') {
    const control = node('button', label, 'btn ' + kind);
    control.type = 'button';
    control.addEventListener('click', async event => {
      if (!event.isTrusted) return;
      control.disabled = true;
      try { await action(); }
      catch (error) { status.textContent = error.message; }
      finally { control.disabled = false; }
    });
    return control;
  }
  function statusLine() {
    const status = node('p', '', 'callout');
    status.setAttribute('role', 'status');
    return status;
  }
  function theme() {
    $('#themeToggle')?.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      $('#themeToggle').setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      $('#themeIcon')?.setAttribute('href', next === 'light' ? '#i-moon' : '#i-sun');
      text('#themeLabel', next === 'light' ? 'Dark mode' : 'Light mode');
    });
  }
  function details(target, value) {
    target.replaceChildren(node('pre', JSON.stringify(value, null, 2), 'code'));
    target.firstChild.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
  }

  function designer() {
    let captureUrl;
    function go(view) {
      $$('.view').forEach(element => element.classList.toggle('active', element.id === 'view-' + view));
      $$('.nav-item').forEach(control => {
        const selected = control.dataset.view === view;
        control.classList.toggle('active', selected);
        control.setAttribute('aria-current', selected ? 'page' : 'false');
      });
      text('#crumb', $('.nav-item.active')?.textContent.trim() || 'Overview');
    }
    document.addEventListener('click', event => {
      const view = event.target.closest('[data-view],[data-go]');
      if (view) go(view.dataset.view ?? view.dataset.go);
    });
    const link = $('a[href="agent_performance_v6_reference.html"]');
    link?.addEventListener('click', event => { event.preventDefault(); request('navigate','performance').catch(()=>{}); });
    text('.top-mode', 'DSH workspace');
    text('.footnote', 'Power BI Live Designer');
    $('#helpBtn')?.remove();
    $('#statusBtn')?.remove();
    $('#sidebarEndpoint')?.closest('.sidebar-bottom')?.remove();
    $('#view-overview .section-title')?.remove();
    $('#view-overview .grid4')?.remove();
    $('#view-overview .bottom-grid')?.remove();
    $$('#view-overview [data-modal]').forEach(element => element.remove());
    $('#view-overview .detail-table')?.remove();
    $('#view-overview .flow-foot')?.remove();
    $('#view-overview .split article:nth-child(2)')?.remove();
    text('#view-overview .split .card-head p', 'Confirmed project for this chat');
    text('#view-overview .page-head p', 'Monitor report development and open the controls for the current project.');
    $$('#view-overview [data-go="planner"]').forEach(element => {element.textContent = 'Refresh data';});

    function replaceView(id, title, description) {
      const view = $('#view-' + id);
      const header = node('div', undefined, 'page-head');
      const copy = node('div');
      copy.append(node('h1', title),node('p', description));
      header.append(copy);
      const card = node('article', undefined, 'card');
      const status = statusLine();
      const output = node('div');
      card.append(status,output);
      view.replaceChildren(header,card);
      return {card, status, output};
    }

    const refresh = replaceView('planner','Refresh data','Select the import tables to refresh in the confirmed report.');
    refresh.card.prepend(button('Connect to open report', async () => {
      const connected = await request('tables');
      const fields = node('fieldset');
      fields.append(node('legend','Tables to refresh'));
      for (const table of connected.tables) {
        const label = node('label', undefined, 'checkline');
        const input = node('input');
        input.type = 'checkbox';
        input.value = table;
        label.append(input,document.createTextNode(' ' + table));
        fields.append(label);
      }
      const action = button('Refresh selected tables', async () => {
        const tables = [...fields.querySelectorAll('input:checked')].map(input => input.value);
        if (!tables.length || tables.length > 20) throw Error('Select between 1 and 20 tables.');
        refresh.status.textContent = 'Refreshing selected tables in Power BI Desktop…';
        const {refresh:result} = await request('refresh', {project:connected.project,tables});
        refresh.status.textContent = result.ok ? 'Refresh completed. Power BI returned these row counts.' :
          result.error || 'Power BI did not confirm the full refresh.';
        details(results, {completed:result.completed,observations:result.observations,pendingTable:result.pendingTable});
        if (result.outcome === 'unknown') action.remove();
      },refresh.status);
      const results = node('div');
      refresh.output.replaceChildren(fields,action,results);
      refresh.status.textContent = connected.tables.length + ' tables available.';
    },refresh.status));

    const review = replaceView('reviews','Review and approval','Review the exact report or model edits staged in this chat.');
    review.card.prepend(button('Review pending changes', async () => {
      review.output.replaceChildren();
      const {change} = await request('review');
      if (!change?.changedFiles?.length) {
        review.status.textContent = 'No file edits are waiting for approval.';
        return;
      }
      review.status.textContent = change.summary;
      review.output.append(node('p',change.project));
      const files = node('ul');
      for (const file of change.changedFiles) files.append(node('li',file));
      review.output.append(files);
      if (!change.reviewDiff) {
        review.output.append(node('p','Ask the agent to split this change into smaller parts so the complete diff can be reviewed.'));
        return;
      }
      const diff = node('pre',change.reviewDiff,'code');
      diff.style.cssText = 'max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere';
      diff.tabIndex = 0;
      diff.setAttribute('aria-label','Exact file changes');
      review.output.append(diff,button('Approve these changes', async () => {
        await request('approve',{id:change.id,digest:change.digest});
        review.output.replaceChildren();
        review.status.textContent = 'Changes approved. The agent can continue.';
      },review.status));
    },review.status));

    const model = replaceView('model','Semantic model','Read the report’s saved tables, measures, and relationships.');
    model.card.prepend(button('Inspect semantic model',async () => {
      const data = await request('model');
      details(model.output,data.model);
      model.status.textContent = 'Saved model metadata loaded.';
    },model.status));

    const journal = replaceView('journal','Operation journal','Read operations recorded for this chat.');
    journal.card.prepend(button('Read operations',async () => {
      const data = await request('journal');
      details(journal.output,{reportOperations:data.entries,hostOperations:data.hostEntries});
      journal.status.textContent = 'Operation history loaded.';
    },journal.status));

    const evidence = replaceView('evidence','Screenshot evidence','Capture a page from the confirmed report.');
    const pageLabel = node('label','Page ID (optional)','input-label');
    const page = node('input');
    page.className = 'field';
    pageLabel.append(page);
    evidence.card.prepend(pageLabel,button('Capture report page',async () => {
      const {image} = await request('capture',page.value.trim());
      if (captureUrl) URL.revokeObjectURL(captureUrl);
      captureUrl = URL.createObjectURL(image);
      const preview = node('img');
      preview.alt = 'Power BI report page capture';
      preview.style.maxWidth = '100%';
      preview.src = captureUrl;
      evidence.output.replaceChildren(preview);
      evidence.status.textContent = 'Report page captured.';
    },evidence.status));

    async function updateTask() {
      try {
        const {task} = await request('task');
        const project = task?.project;
        text('#pathDisplay', project || 'Waiting for PBIP path');
        text('#alertTitle', project ? 'Development status' : 'Start with a saved Power BI project');
        const latest = task?.latest;
        text('#alertDescription', project ? (latest ? latest.operation.split('/').filter(Boolean).at(-1) + ' · ' + latest.outcome : 'Project path confirmed. Choose your next action.') :
          task?.mode === 'existing' ? 'Open the existing .pbip in Power BI Desktop and paste its full path into this chat.' :
            'Open Power BI Desktop, save a new Power BI Project (.pbip) or open an existing one, and paste its full path into this chat.');
        $$('.nav-item, [data-go]').forEach(control => {control.disabled = !project && (control.dataset.view ?? control.dataset.go) !== 'overview';});
      } catch (error) { text('#alertDescription', error.message); }
      setTimeout(updateTask,3500);
    }
    updateTask();
  }

  function performance() {
    $('a[href="powerbi_live_designer_v6_reference.html"]')?.addEventListener('click', event => {
      event.preventDefault();
      request('navigate','designer').catch(()=>{});
    });
    for (const id of ['showcase','activity','pipeline','efficiency','quality','impact','insights','data']) $('#'+id)?.remove();
    $('.filter-bar')?.remove();
    $('.footer')?.remove();
    text('#sourceBadge','DSH operation journal');
    text('.profile > p','Power BI activity for this chat');
    text('#dataMessage','Token and cost data unavailable');
    text('#production h2','Operation outcomes');
    text('#production .section-head .subhead','Recorded Power BI activity');
    text('#production .chart-head h3','Recorded operations by day');
    text('#production .chart-head .subhead','Recent session journal');
    $('.chart-legend')?.remove();
    text('#deliveries h2','Recent operations');
    $('#deliverySearch')?.closest('.toolbar')?.remove();
    for (const id of ['deliverySearch','deliveryStatus','loadMore','deliveryFoot']) $('#'+id)?.remove();

    function stat(label, value) {
      const card = node('div',undefined,'card card-pad');
      card.append(node('div',label,'subhead'),node('strong',String(value),'mono'));
      return card;
    }
    async function render() {
      try {
        const {activity} = await request('performance');
        const operations = activity?.operations ?? [];
        $('#metricStrip').replaceChildren(
          stat('Recorded operations',activity?.operationCount ?? 0),
          stat('Confirmed table refreshes',activity?.tablesRefreshed ?? 0),
        );
        $('#outcomeCards').replaceChildren(...Object.entries(activity?.outcomes ?? {}).map(([outcome,count])=>stat(outcome,count)));
        const dates = new Map();
        for (const operation of operations) {
          const date = (operation.startedAt ?? operation.lastEventAt)?.slice(0,10);
          if (date) dates.set(date,(dates.get(date) ?? 0) + 1);
        }
        const chart = $('#outputChart');
        chart.style.height = 'auto';
        chart.replaceChildren();
        for (const [date,count] of dates) {
          const row = node('div',date + ' · ' + count,'card-pad');
          const bar = node('meter');
          bar.max = Math.max(...dates.values());
          bar.value = count;
          bar.setAttribute('aria-label',date + ' recorded operations');
          row.append(bar);
          chart.append(row);
        }
        if (!operations.length) chart.append(node('p','No Power BI activity recorded for this task.'));
        const list = $('#deliveryList');
        list.replaceChildren(...operations.slice().reverse().map(operation=>{
          const row = node('div',undefined,'card card-pad');
          row.append(node('strong',operation.operation),node('p',operation.outcome +
            (operation.observedDurationMs === null ? '' : ' · ' + (operation.observedDurationMs / 1000).toFixed(1) + ' s observed')));
          return row;
        }));
      } catch (error) { text('#dataMessage',error.message); }
      setTimeout(render,5000);
    }
    render();
  }

  theme();
  if ($('#view-overview')) designer();
  else performance();
})();
