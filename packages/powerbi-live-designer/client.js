/**
 * Browser half of @local/dsh-plugin-powerbi-live-designer.
 *
 * Registers one right-Sidebar tab, "Power BI Live Designer", that talks to the
 * Host plugin's authenticated /api/pbi-live-designer/* operations. It shows the
 * coordinator state, the latest Desktop screenshot, and the smart affected-table
 * refresh plan form. Every mutating action goes through the Host, which owns the
 * per-Session binding and the explicit approval gate.
 *
 * Build contract: this file is the factory body of the client bundle the DSH
 * loader expects (window.__ModuleLoader__.load -> factory(require) -> exports).
 */
window.__ModuleLoader__.load({
  id: "@local/dsh-plugin-powerbi-live-designer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const MODULE_ID = "@local/dsh-plugin-powerbi-live-designer";
    const TAB_KIND = "powerbi-live-designer";
    const NAMESPACE = "powerbiLiveDesigner";
    const API_BASE = "/api/pbi-live-designer/";

    const DICTS = {
      en: {
        "type.label": "Power BI Live Designer",
        "guide.title": "Power BI Live Designer",
        "guide.description": "Preview and safely refresh a Power BI report",
        phase: "Phase",
        lastAction: "Last action",
        adapter: "Model adapter",
        configured: "configured",
        notConfigured: "not configured",
        "project.label": "Project (.pbip)",
        "service.label": "Local service URL",
        connect: "Connect",
        status: "Check status",
        capture: "Capture screenshot",
        abort: "Abort pending plan",
        "page.label": "Page id (optional)",
        noShot: "No screenshot captured yet. Open the PBIP in Power BI Desktop, then capture.",
        "plan.title": "Smart affected-table refresh",
        "plan.policy": "Policy: smart · scope: affected · DAX and screenshots on",
        "plan.hint": "Planning performs no Desktop changes. Running requires explicit approval and may change the live model.",
        changeKind: "Change type",
        "kind.source_data": "Source data changed (no PBIP file edit)",
        "kind.m_expression": "Power Query M or Import definition changed",
        "kind.measure": "Measure edited in TMDL",
        "kind.pbir": "Report layout only",
        tables: "Affected Import table names (comma separated)",
        lineage: "I verified the table dependencies and Import storage mode",
        tmdlValidated: "TMDL/model-file changes were validated by the modeling tools",
        dax: "DAX verification query (required)",
        pages: "Report page IDs (comma separated, optional)",
        buildPlan: "Build safe refresh plan",
        runPlan: "Run approved plan",
        confirmRun: "Run the reviewed refresh plan? Make a backup first. Processing may change the live Desktop model.",
        connected: "Connected to the local Power BI service.",
        notConnected: "Connect to the report to use file editing tools.",
        noSession: "Open a Session to use Power BI Live Designer.",
        ready: "Ready",
        working: "Working…"
        ,inspect: "Inspect semantic model (read-only)", journal: "Operation journal", evidence: "Screenshot evidence",
        connectionChecks: "Last connection check", inspection: "Semantic metadata", disconnected: "Not verified",
        serviceReachable: "Service reachable",
        projectExists: "Project exists", desktopAccessible: "Desktop accessible", unsavedChanges: "Unsaved Desktop changes"
      },
      zh: {
        "type.label": "Power BI Live Designer",
        "guide.title": "Power BI Live Designer",
        "guide.description": "预览并安全刷新 Power BI 报表",
        phase: "阶段",
        lastAction: "上次操作",
        adapter: "模型适配器",
        configured: "已配置",
        notConfigured: "未配置",
        "project.label": "项目 (.pbip)",
        "service.label": "本地服务 URL",
        connect: "连接",
        status: "检查状态",
        capture: "捕获截图",
        abort: "中止待处理计划",
        "page.label": "页面 ID（可选）",
        noShot: "尚未捕获截图。请在 Power BI Desktop 中打开 PBIP，然后捕获。",
        "plan.title": "智能受影响表刷新",
        "plan.policy": "策略：smart · 范围：affected · DAX 与截图已开启",
        "plan.hint": "计划不会对 Desktop 做任何更改。运行需要明确批准，并可能更改实时模型。",
        changeKind: "更改类型",
        "kind.source_data": "源数据已更改（未编辑 PBIP 文件）",
        "kind.m_expression": "Power Query M 或 Import 定义已更改",
        "kind.measure": "已在 TMDL 中编辑度量值",
        "kind.pbir": "仅报表布局",
        tables: "受影响的 Import 表名（逗号分隔）",
        lineage: "我已验证表依赖关系和 Import 存储模式",
        tmdlValidated: "TMDL/模型文件更改已由建模工具验证",
        dax: "DAX 验证查询（必填）",
        pages: "报表页面 ID（逗号分隔，可选）",
        buildPlan: "构建安全刷新计划",
        runPlan: "运行已批准的计划",
        confirmRun: "运行已评审的刷新计划？请先备份。处理可能更改实时 Desktop 模型。",
        connected: "已连接到本地 Power BI 服务。",
        notConnected: "连接到报表以使用文件编辑工具。",
        noSession: "请打开一个会话以使用 Power BI Live Designer。",
        ready: "就绪",
        working: "处理中…"
      }
    };

    const css = {
      root: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        boxSizing: "border-box",
        height: "100%",
        minHeight: 0,
        overflow: "auto",
        color: "var(--dsw-alias-label-primary, CanvasText)",
        background: "var(--dsw-alias-bg-base, Canvas)",
        font: "var(--dsw-font-xxs-12, 12px/1.45 system-ui, sans-serif)"
      },
      header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
      title: { margin: 0, fontSize: 14, fontWeight: 650 },
      pill: {
        border: "1px solid var(--dsw-alias-border-l3, rgba(127,127,127,.4))",
        borderRadius: 99,
        padding: "3px 8px",
        fontSize: 11,
        whiteSpace: "nowrap",
        color: "var(--dsw-alias-label-secondary, GrayText)"
      },
      pillBusy: {
        borderColor: "var(--dsw-alias-state-business-primary, #4d6bfe)",
        color: "var(--dsw-alias-state-business-primary, #4d6bfe)"
      },
      row: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
      label: { display: "block", fontSize: 11, color: "var(--dsw-alias-label-secondary, GrayText)", marginBottom: 4 },
      input: {
        flex: "1 1 180px",
        minWidth: 0,
        boxSizing: "border-box",
        padding: "6px 8px",
        borderRadius: "var(--dsw-radius-sm, 6px)",
        border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))",
        background: "var(--dsw-alias-bg-layer-1, Field)",
        color: "var(--dsw-alias-label-primary, CanvasText)",
        font: "inherit"
      },
      select: {
        width: "100%",
        boxSizing: "border-box",
        padding: "6px 8px",
        borderRadius: "var(--dsw-radius-sm, 6px)",
        border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))",
        background: "var(--dsw-alias-bg-layer-1, Field)",
        color: "var(--dsw-alias-label-primary, CanvasText)",
        font: "inherit"
      },
      textarea: {
        width: "100%",
        boxSizing: "border-box",
        minHeight: 44,
        resize: "vertical",
        padding: "6px 8px",
        borderRadius: "var(--dsw-radius-sm, 6px)",
        border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))",
        background: "var(--dsw-alias-bg-layer-1, Field)",
        color: "var(--dsw-alias-label-primary, CanvasText)",
        font: "inherit"
      },
      button: {
        padding: "6px 10px",
        borderRadius: "var(--dsw-radius-sm, 6px)",
        border: "1px solid var(--dsw-alias-border-l3, rgba(127,127,127,.4))",
        background: "transparent",
        color: "inherit",
        font: "inherit",
        cursor: "pointer"
      },
      primary: {
        border: "1px solid transparent",
        background: "var(--dsw-alias-state-business-primary, #4d6bfe)",
        color: "#fff"
      },
      warn: { borderColor: "var(--dsw-alias-state-warning-primary, #b5791f)", color: "var(--dsw-alias-state-warning-primary, #b5791f)" },
      card: {
        border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))",
        borderRadius: "var(--dsw-radius-md, 10px)",
        background: "var(--dsw-alias-bg-layer-1, Field)",
        padding: 10
      },
      cardTitle: { margin: "0 0 6px", fontSize: 12, fontWeight: 650 },
      hint: { margin: "0", fontSize: 10, lineHeight: 1.5, color: "var(--dsw-alias-label-tertiary, GrayText)" },
      meta: { fontSize: 11, color: "var(--dsw-alias-label-secondary, GrayText)", overflowWrap: "anywhere" },
      shot: {
        position: "relative",
        display: "grid",
        placeItems: "center",
        minHeight: 180,
        borderRadius: "var(--dsw-radius-md, 10px)",
        overflow: "hidden",
        background: "var(--dsw-alias-bg-layer-2, Canvas)",
        border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))"
      },
      shotImg: { display: "block", maxWidth: "100%", maxHeight: "46vh", objectFit: "contain" },
      empty: { padding: 24, textAlign: "center", fontSize: 12, color: "var(--dsw-alias-label-tertiary, GrayText)" },
      check: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--dsw-alias-label-secondary, GrayText)", margin: "6px 0" },
      plan: {
        maxHeight: 190,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        padding: 8,
        borderRadius: "var(--dsw-radius-sm, 6px)",
        background: "var(--dsw-alias-bg-layer-2, Canvas)",
        font: "10px/1.5 ui-monospace, monospace",
        margin: "8px 0 0"
      }
    };

    function progressLabel(entry) {
      if (!entry) return 'Project path received';
      const operation = entry.operation.split('/').filter(Boolean).at(-1);
      const labels = {
        plan:'Design plan', stage:'File changes', validate:'Validation', approve:'Review',
        apply:'Apply edits', reload:'Reload definitions', 'direct-refresh':'Data refresh',
        run:'Run', capture:'Capture', semantic:'Model inspection',
      };
      const states = {
        started:'in progress', dispatch:'in progress', succeeded:'complete', verified:'verified',
        refreshed:'checking remaining tables', failed:'failed', blocked:'blocked', unknown:'unconfirmed',
        'verification-incomplete':'verification incomplete', stopped:'stopped',
      };
      return labels[operation] && states[entry.outcome]
        ? `${labels[operation]} · ${states[entry.outcome]}`
        : 'Project path received';
    }

    function makeBody(t, getCommands) {
      function Body(props) {
        const {sessionId} = props;
        const [busy, setBusy] = useState(false);
        const [state, setState] = useState(null);
        const [message, setMessage] = useState("");
        const [pageId, setPageId] = useState("");
        const [shotFailed, setShotFailed] = useState(false);
        const [inspection, setInspection] = useState(null);
        const [journal, setJournal] = useState(null);
        const [reviewState, setReviewState] = useState(null);
        const [reviewBusy, setReviewBusy] = useState(false);
        const review = reviewState?.sessionId === sessionId ? reviewState : null;
        const [directState, setDirectState] = useState(null);
        const [directBusy, setDirectBusy] = useState(false);
        const [taskState, setTaskState] = useState(null);
        const [view, setView] = useState("overview");
        const task = taskState?.sessionId === sessionId ? taskState.task : null;
        const project = task?.project ?? "";
        const direct = directState?.sessionId === sessionId ? directState : null;

        const call = useCallback(async (op, body, signal) => {
          const response = await fetch(API_BASE + op, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId, ...(body || {}) }), signal
          });
          const payload = await response.json().catch(() => ({ ok: false, error: "Non-JSON response" }));
          if (!response.ok || payload.ok === false) throw new Error(payload.error || ("HTTP " + response.status));
          return payload;
        }, [sessionId]);

        async function connectOpenReport() {
          setDirectBusy(true);
          setDirectState(null);
          try {
            const {project:connectedProject, tables} = await call('direct-connect', {project});
            setDirectState({sessionId, project:connectedProject, tables, selected:[]});
            setMessage('');
          } catch (error) {
            setDirectState({sessionId, error:error.message});
          } finally {
            setDirectBusy(false);
          }
        }

        async function refreshSelectedTables() {
          if (directBusy || !direct?.selected?.length) return;
          setDirectBusy(true);
          try {
            const {refresh:result} = await call('direct-refresh', {project:direct.project, tables:direct.selected});
            setDirectState({...direct, result, error:result.error});
          } catch (error) {
            setDirectState({...direct, error:error.message});
          } finally {
            setDirectBusy(false);
          }
        }

        async function reviewChanges() {
          setReviewBusy(true);
          setReviewState(null);
          try {
            const {change} = await call('change-pending');
            setReviewState({sessionId, change});
          } catch (error) {
            setReviewState({sessionId, error:error.message});
          } finally {
            setReviewBusy(false);
          }
        }

        async function approveChanges() {
          const change = review?.change;
          if (reviewBusy || !change?.changedFiles?.length || !change.reviewDiff) return;
          setReviewBusy(true);
          try {
            const response = await getCommands()?.execute(sessionId, `/pbi approve ${change.id} ${change.digest}`, []);
            if (!response) throw Error('DSH approval is unavailable. Reopen DSH and review the changes again.');
            const result = response.value?.result;
            if (!response.ok || result?.kind !== 'success') {
              throw Error(result?.text ?? response.error?.message ?? 'The approval command is unavailable.');
            }
            setReviewState({sessionId, approved:true});
          } catch (error) {
            setReviewState({sessionId, change, error:error.message});
          } finally {
            setReviewBusy(false);
          }
        }

        useEffect(() => {
          if (!sessionId) return;
          const controller = new AbortController();
          let timer;
          async function pollTask() {
            try {
              const result = await call("task-status", {}, controller.signal);
              if (controller.signal.aborted) return;
              setTaskState({sessionId, task:result.task});
            } catch {}
            if (!controller.signal.aborted) timer = setTimeout(pollTask, 2000);
          }
          pollTask();
          return () => { controller.abort(); clearTimeout(timer); };
        }, [call, sessionId]);

        async function run(action) {
          if (busy) return;
          setBusy(true);
          try {
            await action();
          } catch (error) {
            setMessage(String(error.message || error));
          } finally {
            setBusy(false);
          }
        }

        function inspect() {
          return run(async () => { const result = await call('semantic', {}); setInspection(result.model); });
        }
        function readJournal() {
          return run(async () => { setJournal(await call('journal', {})); });
        }

        function capture() {
          return run(async () => {
            const result = await call("capture", { page: pageId.trim() });
            setState(result.state ?? null);
            setMessage(result.message ?? "");
            setShotFailed(false);
          });
        }

        const shotUrl = state?.hasImage && typeof sessionId === "string" && sessionId !== "" && !shotFailed
          ? API_BASE + "artifact?sessionId=" + encodeURIComponent(sessionId) + "&v=" + (state?.captureVersion ?? 0)
          : null;

        if (typeof sessionId !== "string" || sessionId === "") {
          return h("div", { style: css.root }, h("div", { style: css.empty }, t("noSession")));
        }

        const overview = h('section', {style:css.card, 'aria-label':'Project overview'},
          h('h4', {style:css.cardTitle}, task?.project ? 'Project overview' : 'Start with a saved Power BI project'),
          h('p', {style:css.hint}, task?.project ?? (task?.mode === 'existing'
            ? 'Open your existing .pbip in Power BI Desktop and paste its full path into this chat.'
            : 'For a new report, open Power BI Desktop, save a Power BI Project (.pbip), and paste its full path into this chat. For an existing report, open its .pbip and paste that path.')),
          task?.project && h('p', {role:'status'}, progressLabel(task.latest)),
        );
        if (!project) {
          return h('div', {style:{...css.root,padding:16,fontFamily:'Geist, system-ui, sans-serif'}},
            h('h3', {style:css.title}, t('type.label')), overview);
        }

        return h(
          "div",
          { style: {...css.root,padding:16,fontFamily:'Geist, system-ui, sans-serif'} },
          h(
            "div",
            { style: css.header },
            h("h3", { style: css.title }, t("type.label")),
            h("span", { style: { ...css.pill, ...(busy || directBusy ? css.pillBusy : null) } },
              busy || directBusy ? t("working") : direct?.project ? "Connected to Power BI" : "Project selected")
          ),
          h("style", null, `.pbi-designer-nav button:focus-visible {
            outline: 2px solid var(--dsw-alias-label-primary, currentColor);
            outline-offset: 2px;
          }`),
          h('nav', {className:'pbi-designer-nav', style:{...css.row,gap:4}, 'aria-label':'Power BI workspace'},
            ...Object.entries({
              overview:'Overview', refresh:'Refresh data', review:'Change review',
              model:'Semantic model', journal:'Operation journal', evidence:'Evidence',
            }).map(([id,label])=>h('button', {
              key:id,type:'button','aria-current':view === id ? 'page' : undefined,
              onClick:()=>setView(id),
              style:{...css.button,borderColor:'transparent',background:view === id
                ? 'var(--dsw-alias-fill-secondary, ButtonFace)' : 'transparent'},
            },label)),
          ),
          overview,
          message && h('p', {role:'status',style:css.meta}, message),
          view === 'refresh' && h('section', {style:css.card, 'aria-label':'Refresh Power BI data'},
            h('h4', {style:css.cardTitle}, 'Refresh data'),
            h('p', {style:css.hint}, 'Connect to the confirmed project in Power BI Desktop, then select the tables to refresh.'),
            h('button', {type:'button', style:css.button, disabled:directBusy || !sessionId || !project.trim(), onClick:connectOpenReport},
              'Connect to open report'),
            direct?.project && h('div', null,
              h('p', {style:css.meta}, direct.project),
              h('fieldset', {style:{border:0,padding:0,margin:'8px 0',maxHeight:200,overflow:'auto'}, disabled:directBusy},
                h('legend', null, 'Tables to refresh'),
                ...direct.tables.map(table => h('label', {key:table, style:css.check},
                  h('input', {type:'checkbox', checked:direct.selected.includes(table),
                    disabled:!direct.selected.includes(table) && direct.selected.length >= 20,
                    onChange:event => {
                      const checked = event.target.checked;
                      setDirectState(current => ({...current, selected:checked
                        ? [...current.selected, table] : current.selected.filter(name => name !== table),
                      }));
                    },
                  }), table)),
              ),
              h('button', {type:'button', style:css.button,
                disabled:directBusy || !direct.selected.length || direct.result?.outcome === 'unknown',
                onClick:refreshSelectedTables,
              }, 'Refresh selected tables'),
            ),
            directBusy && h('p', {role:'status'}, 'Waiting for Power BI…'),
            direct?.error && h('p', {role:'alert'}, direct.error),
            direct?.result?.pendingTable && h('p', null, `Refresh unconfirmed for ${direct.result.pendingTable}.`),
            direct?.result?.ok === false && direct.result.completed.length > 0
              && h('p', null, `Power BI confirmed refresh for ${direct.result.completed.join(', ')}.`),
            direct?.result?.ok && h('p', {role:'status'}, 'Refresh completed and row counts were read from Power BI.'),
            direct?.result?.observations?.length > 0 && h('ul', null,
              ...direct.result.observations.map(row => h('li', {key:row.table}, `${row.table} · ${row.rowCount.toLocaleString()} rows`))),
          ),
          view === 'review' && h('section', {style:css.card, 'aria-label':'Review Power BI changes'},
            h('h4', {style:css.cardTitle}, 'Review changes'),
            h('p', {style:css.hint}, 'Review the report or model edits before the agent applies them.'),
            h('button', {type:'button', style:css.button, disabled:reviewBusy || !sessionId, onClick:reviewChanges},
              reviewBusy ? 'Working…' : 'Review pending changes'),
            review?.error && h('p', {role:'alert'}, review.error),
            review?.approved && h('p', {role:'status'}, 'Changes approved. Tell the agent to continue.'),
            review && !review.change && !review.error && !review.approved
              && h('p', {role:'status'}, 'There are no validated changes waiting for review in this chat.'),
            review?.change && h('div', null,
              h('p', {style:css.meta}, review.change.project),
              h('p', null, review.change.summary),
              !review.change.changedFiles.length
                ? h('p', {role:'status'}, 'The files are unchanged. Use Refresh data to load rows into the open model.')
                : h('div', null,
                  h('ul', null, ...review.change.changedFiles.map(file => h('li', {key:file}, file))),
                  typeof review.change.reviewDiff === 'string' && review.change.reviewDiff
                    ? h('div', null,
                      h('pre', {style:{...css.plan,maxHeight:320,overflow:'auto'}, tabIndex:0, 'aria-label':'Exact file changes'}, review.change.reviewDiff),
                      h('p', {style:css.hint}, 'Approval lets the agent apply these edits, reload definitions, and refresh the affected tables.'),
                      h('button', {type:'button', style:css.button, disabled:reviewBusy, onClick:approveChanges},
                        'Approve these changes'),
                    )
                    : h('p', {role:'status'}, 'The full diff cannot be shown here. Ask the agent to split this into smaller changes.'),
                ),
            ),
          ),
          view === 'model' && h('section', {style:css.card},
            h('h4', {style:css.cardTitle}, 'Model explorer'),
            h('button', {type:'button',style:css.button,disabled:busy,onClick:inspect},t('inspect')),
          ),
          view === 'model' && inspection ? h('details', {open:true}, h('summary', null, t('inspection')),
            h('pre', {style:css.plan}, JSON.stringify({source:inspection.source,
              tables:inspection.tables?.map(table => ({name:table.name,columns:table.columns?.map(c=>c.name),measures:table.measures?.map(m=>m.name)})),
              relationships:inspection.relationships, warnings:inspection.warnings, limitations:inspection.limitations}, null, 2))) : null,
          view === 'journal' && h('section', {style:css.card},
            h('h4', {style:css.cardTitle}, t('journal')),
            h('button', {type:'button',style:css.button,disabled:busy,onClick:readJournal},'Read operations'),
          ),
          view === 'journal' && journal ? h('details', {open:true}, h('summary', null, t('journal')),
            h('div', {style:css.meta}, journal.journalPath),
            h('div', {style:css.meta}, journal.hostJournalPath),
            journal.error ? h('p', {role:'status',style:css.meta}, journal.error) : null,
            h('pre', {style:css.plan}, JSON.stringify({reportOperations:journal.entries,host:journal.hostEntries}, null, 2))) : null,
          view === 'evidence' && h(
            "section",
            {style:css.card},
            h("h4", {style:css.cardTitle}, t("evidence")),
            h("label", {style:css.label}, t("page.label"),
              h("input", {style:css.input,value:pageId,onChange:event=>setPageId(event.target.value)})),
            h("button", {type:"button",style:css.button,disabled:busy,onClick:capture}, t("capture")),
            h("div", { style: css.shot },
            shotUrl === null
              ? h("div", { style: css.empty }, t("noShot"))
              : h("img", {
                  style: css.shotImg,
                  src: shotUrl,
                  alt: t("type.label"),
                  onError: () => setShotFailed(true)
                }))
          )
        );
      }
      return Body;
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NAMESPACE);

      function Title() {
        return h("span", null, t("type.label"));
      }
      ctx.effect(() => ctx.locale.register(NAMESPACE, {
        en: DICTS.en,
        zh: {...DICTS.en, ...DICTS.zh}
      }), "powerbi-live-designer.copy");

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_KIND,
        kind: TAB_KIND,
        title: () => t("type.label"),
        guide: [{
          id: TAB_KIND,
          commandId: "powerbi-live-designer.open",
          order: 30,
          title: () => t("guide.title"),
          description: () => t("guide.description")
        }]
      }), "powerbi-live-designer.type");

      ctx.effect(() => ctx.shortcuts.register({
        id: "powerbi-live-designer.open",
        label: () => t("type.label"),
        aliases: ["power bi", "power bi live designer"],
        defaults: {},
        regions: ["page", "editable", "terminal"],
        modals: [],
        resolve: ({target: element}) => {
          const target = ctx.sidebarRight.commandTarget(element);
          if (target === undefined) return {status: "blocked", reason: t("noSession")};
          return {status: "handled", run: () => ctx.sidebarRight.openTabFromTarget(TAB_KIND, target)};
        }
      }), "powerbi-live-designer.open");

      ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
        name: "sidebar.right.pane.tab",
        key: TAB_KIND,
        locale: NAMESPACE
      }, makeBody(t, () => ctx.get("remote.commands") ?? ctx.get("remote")?.commands))), "powerbi-live-designer.body");

      ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
        name: "sidebar.right.pane.tab.title",
        key: TAB_KIND,
        locale: NAMESPACE
      }, Title)), "powerbi-live-designer.title");

      ctx.effect(() => {
        const opened = new Map();
        const controller = new AbortController();
        let timer;
        async function checkActiveTask() {
          const sessionId = ctx.sidebarRight.mounted.getSnapshot();
          try {
            if (sessionId) {
              const response = await fetch(API_BASE + 'task-status', {
                method:'POST', headers:{'content-type':'application/json'},
                body:JSON.stringify({sessionId}), signal:controller.signal,
              });
              const {task} = await response.json();
              if (!controller.signal.aborted && task && opened.get(sessionId) !== task.startedAt
                  && ctx.sidebarRight.mounted.getSnapshot() === sessionId) {
                ctx.sidebarRight.openTabIn(sessionId, TAB_KIND);
                opened.set(sessionId, task.startedAt);
              }
            }
          } catch {}
          if (!controller.signal.aborted) timer = setTimeout(checkActiveTask, 2500);
        }
        if (ctx.sidebarRight.mounted) timer = setTimeout(checkActiveTask, 0);
        return () => { controller.abort(); clearTimeout(timer); };
      }, "powerbi-live-designer.task-launcher");
    }

    exports.name = MODULE_ID;
    exports.inject = ["slots", "locale", "sidebarRightTabs", "sidebarRight", "shortcuts"];
    exports.apply = apply;

    return module.exports;
  }
});
