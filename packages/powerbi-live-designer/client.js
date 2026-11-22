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
            let reply;
            try { reply = {value:await dispatch(request.op, request.value)}; }
            catch (error) { reply = {error:error.message}; }
            if (active) event.source.postMessage({channel:"pbi-v6-response",id:request.id,...reply},"*");
          }
          window.addEventListener("message",onMessage);
          return () => {
            active = false;
            window.removeEventListener("message",onMessage);
            controller.abort();
          };
        }, [sessionId,surface]);

        if (!sessionId) return h("p", null, "Open a DSH chat to use Power BI Live Designer.");
        const [title, document] = documents[surface];
        return h("iframe", {
          ref:iframe,key:sessionId + surface,title,src:API_BASE+"live/"+document,sandbox:"allow-scripts",
          style:{display:"block",width:"100%",height:"100%",minHeight:360,border:0},
        });
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
