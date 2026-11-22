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

    const TYPE_ID = "@local/dsh-plugin-powerbi-live-designer";
    const NAMESPACE = "powerbiLiveDesigner";
    const DEFAULT_SERVICE_URL = "http://127.0.0.1:8765";
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

    function makeBody(t, commands) {
      function Body(props) {
        const session = props.useSession?.();
        const sessionId = props.sessionId ?? session?.id;
        const [busy, setBusy] = useState(false);
        const [state, setState] = useState(null);
        const [message, setMessage] = useState("");
        const [project, setProject] = useState("");
        const [serviceUrl, setServiceUrl] = useState("");
        const [planId, setPlanId] = useState(null);
        const [planText, setPlanText] = useState("");
        const [kind, setKind] = useState("source_data");
        const [tables, setTables] = useState("");
        const [lineage, setLineage] = useState(false);
        const [tmdlValidated, setTmdlValidated] = useState(false);
        const [dax, setDax] = useState("");
        const [pages, setPages] = useState("");
        const [pageId, setPageId] = useState("");
        const [shotFailed, setShotFailed] = useState(false);
        const [connectionChecks, setConnectionChecks] = useState(null);
        const [connectionReady, setConnectionReady] = useState(false);
        const [inspection, setInspection] = useState(null);
        const [journal, setJournal] = useState(null);
        const [reviewState, setReviewState] = useState(null);
        const [reviewBusy, setReviewBusy] = useState(false);
        const review = reviewState?.sessionId === sessionId ? reviewState : null;
        const [directState, setDirectState] = useState(null);
        const [directBusy, setDirectBusy] = useState(false);
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
            const response = await commands?.execute(sessionId, `/pbi approve ${change.id} ${change.digest}`, []);
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

        const refresh = useCallback(async (signal) => {
          if (typeof sessionId !== "string" || sessionId === "") return;
          try {
            const result = await call("status", {}, signal instanceof AbortSignal ? signal : undefined);
            if (signal?.aborted) return;
            setState(result.state ?? null);
            if (typeof result.project === "string" && result.project !== "") setProject(previous => previous || result.project);
            if (typeof result.serviceUrl === "string" && result.serviceUrl !== "") setServiceUrl(previous => previous || result.serviceUrl);
            setConnectionChecks(result.readiness?.checks ?? null);
            setConnectionReady(result.readiness?.ready === true);
            setMessage(result.state?.lastResult ?? "");
            setShotFailed(false);
          } catch (error) {
            if (signal?.aborted) return;
            setConnectionReady(false);
            setMessage(String(error.message || error));
            return false;
          }
          return true;
        }, [call, sessionId]);

        useEffect(() => {
          if (direct?.project) return;
          const controller = new AbortController();
          let timer;
          async function poll() {
            if (await refresh(controller.signal) && !controller.signal.aborted) timer = setTimeout(poll, 5000);
          }
          poll();
          return () => { controller.abort(); clearTimeout(timer); };
        }, [refresh, direct?.project, connectionReady]);

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

        function connect() {
          return run(async () => {
            setConnectionReady(false);
            const result = await call("configure", { serviceUrl, project });
            setState(result.state ?? null);
            setConnectionChecks(result.readiness?.checks ?? null);
            setConnectionReady(result.ready === true);
            setMessage(result.ready ? t("connected") : result.readiness?.reason ?? t("notConnected"));
            setPlanId(null);
            setShotFailed(false);
          });
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

        function abort() {
          return run(async () => {
            const result = await call("abort", {});
            setPlanId(null);
            setPlanText(JSON.stringify(result, null, 2));
          });
        }

        function manifest() {
          const change = { kind };
          if (kind === "source_data" || kind === "m_expression") {
            change.tables = tables.split(",").map((value) => value.trim()).filter(Boolean);
            change.storage = "Import";
            change.lineageVerified = lineage;
          }
          if (kind === "measure") change.fileEdit = true;
          const manifest = {
            refreshPolicy: "smart",
            refreshScope: "affected",
            verifyDax: true,
            verifyScreenshots: true,
            changes: [change],
            daxQueries: dax.trim() === "" ? [] : [dax.trim()],
            screenshotPages: pages.split(",").map((value) => value.trim()).filter(Boolean)
          };
          if (tmdlValidated) manifest.tmdlValidated = true;
          return manifest;
        }

        function buildPlan() {
          return run(async () => {
            setPlanId(null);
            try {
              const result = await call("plan", { manifest: manifest() });
              setPlanId(result.planId);
              setPlanText(JSON.stringify({ planId: result.planId, plan: result.plan }, null, 2));
              setState(result.state ?? null);
            } catch (error) {
              setPlanText("BLOCKED: " + String(error.message || error));
            }
          });
        }

        function runPlan() {
          if (planId === null) return;
          if (!window.confirm(t("confirmRun"))) return;
          return run(async () => {
            try {
              const result = await call("run", { planId, approved: true });
              setPlanId(null);
              setPlanText(String(result.message ?? ""));
              setState(result.state ?? null);
              setShotFailed(false);
            } catch (error) {
              setPlanText("BLOCKED/FAILED: " + String(error.message || error));
            }
          });
        }

        const phase = state?.refreshPhase ?? "idle";
        const shotUrl = state?.hasImage && typeof sessionId === "string" && sessionId !== "" && !shotFailed
          ? API_BASE + "artifact?sessionId=" + encodeURIComponent(sessionId) + "&v=" + (state?.captureVersion ?? 0)
          : null;

        if (typeof sessionId !== "string" || sessionId === "") {
          return h("div", { style: css.root }, h("div", { style: css.empty }, t("noSession")));
        }

        return h(
          "div",
          { style: css.root },
          h(
            "div",
            { style: css.header },
            h("h3", { style: css.title }, t("type.label")),
            h("span", { style: { ...css.pill, ...(busy || directBusy ? css.pillBusy : null) } },
              busy || directBusy ? t("working") : direct?.project ? "Connected to Power BI" : t(connectionReady ? "ready" : "disconnected"))
          ),
          h(
            "div",
            { style: css.card },
            h("div", { style: css.row },
              h("div", { style: { flex: "1 1 220px" } },
                h("label", { style: css.label }, t("project.label")),
                h("input", {
                  style: css.input, value: project, placeholder: "C:\\BI\\Sales\\Sales.pbip",
                  onChange: (event) => setProject(event.target.value)
                })
              ),
              h("div", { style: { flex: "1 1 160px" } },
                h("label", { style: css.label }, t("service.label")),
                h("input", {
                  style: css.input, value: serviceUrl, placeholder: DEFAULT_SERVICE_URL,
                  onChange: (event) => setServiceUrl(event.target.value)
                })
              ),
              h("div", { style: { flex: "0 0 auto", alignSelf: "flex-end" } },
                h("button", {
                  type: "button", style: { ...css.button, ...css.primary },
                  disabled: busy, onClick: connect
                }, t("connect"))
              )
            ),
            h("div", { style: { ...css.row, marginTop: 8 } },
              h("div", { style: { flex: "1 1 160px" } },
                h("label", { style: css.label }, t("page.label")),
                h("input", { style: css.input, value: pageId, onChange: (event) => setPageId(event.target.value) })
              ),
              h("div", { style: { flex: "0 0 auto", alignSelf: "flex-end", display: "flex", gap: 6, flexWrap: "wrap" } },
                h("button", { type: "button", style: css.button, disabled: busy, onClick: connect }, t("status")),
                h("button", { type: "button", style: css.button, disabled: busy, onClick: inspect }, t("inspect")),
                h("button", { type: "button", style: css.button, disabled: busy, onClick: readJournal }, t("journal")),
                h("button", { type: "button", style: css.button, disabled: busy, onClick: capture }, t("capture")),
                h("button", { type: "button", style: { ...css.button, ...css.warn }, disabled: busy, onClick: abort }, t("abort"))
              )
            ),
            h("div", { style: { ...css.meta, marginTop: 8 } },
              t("phase") + ": " + String(phase) +
              "  ·  " + t("lastAction") + ": " + String(state?.lastAction ?? "none") +
              "  ·  " + t("adapter") + ": " + (state?.modelAdapterConfigured ? t("configured") : t("notConfigured"))
            ),
            connectionChecks ? h('div', {style:css.meta}, t('connectionChecks') + ': ' +
              Object.entries(connectionChecks).map(([key,value]) => t(key) + ': ' + String(value ?? 'unknown')).join(' · ')) : null,
            message === "" ? null : h("div", { role:'status', style: { ...css.meta, color: "var(--dsw-alias-label-tertiary, GrayText)" } }, message)
          ),
          h('section', {style:css.card, 'aria-label':'Refresh Power BI data'},
            h('h4', {style:css.cardTitle}, 'Refresh data'),
            h('p', {style:css.hint}, 'Enter the open .pbip path above. Select the tables you want to reload from their data sources.'),
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
          h('section', {style:css.card, 'aria-label':'Review Power BI changes'},
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
                ? h('p', {role:'status'}, 'The files are unchanged. Use Refresh data above to load rows into the open model.')
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
          inspection ? h('details', {open:true}, h('summary', null, t('inspection')),
            h('pre', {style:css.plan}, JSON.stringify({source:inspection.source,
              tables:inspection.tables?.map(table => ({name:table.name,columns:table.columns?.map(c=>c.name),measures:table.measures?.map(m=>m.name)})),
              relationships:inspection.relationships, warnings:inspection.warnings, limitations:inspection.limitations}, null, 2))) : null,
          journal ? h('details', {open:true}, h('summary', null, t('journal')),
            h('div', {style:css.meta}, journal.journalPath),
            h('div', {style:css.meta}, journal.hostJournalPath),
            journal.error ? h('p', {role:'status',style:css.meta}, journal.error) : null,
            h('pre', {style:css.plan}, JSON.stringify({reportOperations:journal.entries,host:journal.hostEntries}, null, 2))) : null,
          h(
            "details",
            null,
            h("summary", null, t("evidence")),
            h("div", { style: css.shot },
            shotUrl === null
              ? h("div", { style: css.empty }, t("noShot"))
              : h("img", {
                  style: css.shotImg,
                  src: shotUrl,
                  alt: t("type.label"),
                  onError: () => setShotFailed(true)
                }))
          ),
          h(
            "div",
            { style: css.card },
            h("h4", { style: css.cardTitle }, t("plan.title")),
            h("p", { style: css.hint }, t("plan.policy")),
            h("div", { style: { marginTop: 8 } },
              h("label", { style: css.label }, t("changeKind")),
              h("select", { style: css.select, value: kind, onChange: (event) => setKind(event.target.value) },
                h("option", { value: "source_data" }, t("kind.source_data")),
                h("option", { value: "m_expression" }, t("kind.m_expression")),
                h("option", { value: "measure" }, t("kind.measure")),
                h("option", { value: "pbir" }, t("kind.pbir"))
              )
            ),
            kind === "source_data" || kind === "m_expression"
              ? h("div", { style: { marginTop: 8 } },
                  h("label", { style: css.label }, t("tables")),
                  h("input", { style: css.input, value: tables, placeholder: "FactSales, Budget", onChange: (event) => setTables(event.target.value) })
                )
              : null,
            h("label", { style: { ...css.check, marginTop: 8 } },
              h("input", { type: "checkbox", checked: lineage, disabled: !(kind === "source_data" || kind === "m_expression"), onChange: (event) => setLineage(event.target.checked) }),
              " " + t("lineage")
            ),
            h("label", { style: css.check },
              h("input", { type: "checkbox", checked: tmdlValidated, onChange: (event) => setTmdlValidated(event.target.checked) }),
              " " + t("tmdlValidated")
            ),
            h("div", { style: { marginTop: 8 } },
              h("label", { style: css.label }, t("dax")),
              h("textarea", { style: css.textarea, value: dax, placeholder: 'EVALUATE ROW("SalesRows", COUNTROWS(\'FactSales\'))', onChange: (event) => setDax(event.target.value) })
            ),
            h("div", { style: { marginTop: 8 } },
              h("label", { style: css.label }, t("pages")),
              h("input", { style: css.input, value: pages, placeholder: "ReportSectionabc123", onChange: (event) => setPages(event.target.value) })
            ),
            h("div", { style: { ...css.row, marginTop: 10 } },
              h("button", { type: "button", style: css.button, disabled: busy, onClick: buildPlan }, t("buildPlan")),
              h("button", {
                type: "button",
                style: { ...css.button, ...css.warn, ...(planId === null || busy ? { opacity: 0.5, cursor: "not-allowed" } : null) },
                disabled: planId === null || busy || state?.modelWritesEnabled !== true,
                onClick: runPlan
              }, t("runPlan"))
            ),
            h("p", { style: css.hint }, t("plan.hint")),
            planText === "" ? null : h("pre", { style: css.plan }, planText)
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
        id: TYPE_ID,
        kind: "powerbi-live-designer",
        title: () => t("type.label"),
        guide: [{
          id: "open",
          order: 30,
          title: () => t("guide.title"),
          description: () => t("guide.description")
        }]
      }), "powerbi-live-designer.type");

      ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
        name: "sidebar.right.pane.tab",
        key: TYPE_ID,
        locale: NAMESPACE
      }, makeBody(t, ctx.remote?.commands))), "powerbi-live-designer.body");

      ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
        name: "sidebar.right.pane.tab.title",
        key: TYPE_ID,
        locale: NAMESPACE
      }, Title)), "powerbi-live-designer.title");
    }

    exports.name = TYPE_ID;
    exports.inject = ["slots", "locale", "sidebarRightTabs", "remote.commands"];
    exports.apply = apply;

    return module.exports;
  }
});
