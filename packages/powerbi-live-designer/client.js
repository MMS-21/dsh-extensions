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
    const {useEffect, useRef, useState} = React;
    const MODULE_ID = "@local/dsh-plugin-powerbi-live-designer";
    const TAB_KIND = "powerbi-live-designer";
    const NAMESPACE = "powerbiLiveDesigner";
    const API_BASE = "/api/pbi-live-designer/";
    const documents = {
      designer: ["Power BI Live Designer", "powerbi_live_designer_v6_reference.html"],
      performance: ["Agent Performance", "agent_performance_v6_reference.html"],
    };

    function makeBody(getCommands) {
      return function Body({sessionId}) {
        const iframe = useRef(null);
        const [surface, setSurface] = useState("designer");
        const [load, setLoad] = useState(null);
        const [review, setReview] = useState(null);
        const [attempt, setAttempt] = useState(0);
        const scope = JSON.stringify([sessionId,surface,attempt]);
        const page = load?.scope === scope ? load : null;
        const manual = review?.scope === scope ? review : null;
        const [title, document] = documents[surface];
        useEffect(() => {
          if (!sessionId) return;
          let active = true;
          let reviewed;
          const controller = new AbortController();
          async function call(op, body = {}) {
            const response = await fetch(API_BASE + op, {
              method:"POST", headers:{"content-type":"application/json"},
              body:JSON.stringify({...body,sessionId}), signal:controller.signal,
            });
            const result = await response.json();
            if (!response.ok || result.ok === false) throw Error(result.error || "Power BI request failed.");
            return result;
          }
          async function dispatch(op, value) {
            if (op === "navigate") {
              if (Object.hasOwn(documents,value)) setSurface(value);
              return {};
            }
            if (surface === "performance") {
              if (op === "performance") return call("task-performance");
              throw Error("Unsupported performance request.");
            }
            if (op === "task") return call("task-status");
            if (op === "project-status") return call("status");
            if (op === "tables") {
              const {task} = await call("task-status");
              if (!task?.project) throw Error("Paste the full .pbip path into this chat first.");
              return call("direct-connect", {project:task.project});
            }
            if (op === "refresh") return call("direct-refresh", {project:value?.project,tables:value?.tables});
            if (op === "review") {
              reviewed = undefined;
              const result = await call("change-pending");
              reviewed = result.change;
              return result;
            }
            if (op === "approve") {
              if (!reviewed?.changedFiles?.length || !reviewed.reviewDiff ||
                  reviewed.id !== value?.id || reviewed.digest !== value?.digest ||
                  !/^[a-f0-9]{32}$/.test(reviewed.id) || !/^[a-f0-9]{64}$/.test(reviewed.digest)) {
                throw Error("Review the exact staged file changes before approving.");
              }
              const response = await getCommands()?.execute(sessionId, `/pbi approve ${reviewed.id} ${reviewed.digest}`, []);
              const result = response?.value?.result;
              if (!response?.ok || result?.kind !== "success") {
                throw Error(result?.text ?? response?.error?.message ?? "DSH approval is unavailable.");
              }
              reviewed = undefined;
              return {};
            }
            if (op === "model") return call("semantic");
            if (op === "journal") return call("journal");
            if (op === "capture") {
              await call("capture", {page:typeof value === "string" ? value : ""});
              const response = await fetch(API_BASE + "artifact?sessionId=" + encodeURIComponent(sessionId),
                {signal:controller.signal});
              if (!response.ok) throw Error("The captured image is unavailable.");
              return {image:await response.blob()};
            }
            throw Error("Unsupported designer request.");
          }

          async function onMessage(event) {
            const request = event.data;
            if (event.origin !== "null" || event.source !== iframe.current?.contentWindow ||
                request?.channel !== "pbi-v6-request" || !Number.isSafeInteger(request.id)) return;
            clearTimeout(deadline);
            setLoad(current => current?.scope === scope ? {...current,ready:true,error:null} : current);
            let reply;
            try { reply = {value:await dispatch(request.op, request.value)}; }
            catch (error) { reply = {error:error.message}; }
            if (active) event.source.postMessage({channel:"pbi-v6-response",id:request.id,...reply},"*");
          }
          window.addEventListener("message",onMessage);
          const deadline = setTimeout(() => {
            setLoad({scope,error:"The v6 display did not start. You can still review pending changes below."});
          },8000);
          async function loadPage() {
            try {
              const response = await fetch(API_BASE+"live/"+document,{signal:controller.signal});
              const html = await response.text();
              if (!response.ok || !html.includes("pbi-v6-request")) throw Error("The v6 document could not be loaded.");
              if (active) setLoad({scope,src:"data:text/html;charset=utf-8," + encodeURIComponent(html)});
            } catch (error) {
              clearTimeout(deadline);
              if (active) setLoad({scope,error:error.message});
            }
          }
          loadPage();
          return () => {
            active = false;
            clearTimeout(deadline);
            window.removeEventListener("message",onMessage);
            controller.abort();
          };
        }, [sessionId,surface,attempt]);

        async function reviewPending() {
          setReview({scope,busy:true});
          try {
            const response = await fetch(API_BASE+"change-pending", {
              method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId}),
            });
            const result = await response.json();
            if (!response.ok || result.ok === false) throw Error(result.error || "Could not load pending changes.");
            setReview({scope,change:result.change});
          } catch (error) { setReview({scope,error:error.message}); }
        }

        async function approvePending(change) {
          setReview({scope,change,busy:true});
          try {
            const response = await getCommands()?.execute(sessionId,`/pbi approve ${change.id} ${change.digest}`,[]);
            const result = response?.value?.result;
            if (!response?.ok || result?.kind !== "success") {
              throw Error(result?.text ?? response?.error?.message ?? "DSH approval is unavailable.");
            }
            setReview({scope,approved:true});
          } catch (error) { setReview({scope,change,error:error.message}); }
        }

        if (!sessionId) return h("p", null, "Open a DSH chat to use Power BI Live Designer.");
        const change = manual?.change;
        return h("div",{style:{height:"100%",position:"relative",display:"flex",flexDirection:"column"}},
          (!page?.ready || manual) && h("section",{style:{padding:16}},
            h("strong",null,title),
            h("p",{role:"status"},page?.error || (page?.ready ? "Review pending file changes" : "Loading workspace…")),
            page?.error && h("button",{type:"button",onClick:()=>setAttempt(attempt+1)},"Retry workspace"),
            h("button",{type:"button",disabled:manual?.busy,onClick:reviewPending},"Review pending changes"),
            manual?.error && h("p",{role:"alert"},manual.error),
            manual?.approved && h("p",{role:"status"},"Changes approved. The agent can continue."),
            manual && !manual.busy && !manual.error && !manual.approved && !change &&
              h("p",{role:"status"},"No file edits are waiting for approval."),
            change && h("div",null,h("p",null,change.project),h("p",null,change.summary),
              change.reviewDiff && h("pre",{tabIndex:0,style:{maxHeight:360,overflow:"auto",whiteSpace:"pre-wrap"}},change.reviewDiff),
              change.changedFiles?.length && change.reviewDiff && /^[a-f0-9]{32}$/.test(change.id) &&
                /^[a-f0-9]{64}$/.test(change.digest) &&
                h("button",{type:"button",disabled:manual.busy,onClick:()=>approvePending(change)},"Approve these changes"),
            ),
          ),
          page?.src && h("iframe",{
            ref:iframe,key:scope,title,src:page.src,sandbox:"allow-scripts",
            style:{display:"block",width:"100%",flex:1,minHeight:0,border:0,visibility:page.ready?"visible":"hidden"},
          }),
        );
      };
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NAMESPACE);

      function Title() {
        return h("span", null, t("type.label"));
      }
      ctx.effect(() => ctx.locale.register(NAMESPACE, {
        en: {"type.label":"Power BI Live Designer","guide.title":"Power BI Live Designer",
          "guide.description":"Open the Power BI project workspace","noSession":"Open a DSH chat first."},
        zh: {"type.label":"Power BI Live Designer","guide.title":"Power BI Live Designer",
          "guide.description":"打开 Power BI 项目工作区","noSession":"请先打开会话。"}
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
      }, makeBody(() => ctx.get("remote.commands") ?? ctx.get("remote")?.commands))), "powerbi-live-designer.body");

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
