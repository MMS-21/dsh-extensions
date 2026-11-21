import {isDashboardLibrary} from '../lib/dashboard-dialect.js';
import {createSelection} from './data-snapshot.js';
import {fileResourceAddress} from './artifact-resources.js';

/**
 * Browser half of @local/dsh-plugin-render-ui.
 *
 * Registers a `tool.call.toolview` for the `render_ui` wire tool and an inline
 * conversation node for validated OpenUI Lang presentations. The view renders
 * the persisted spec with the OpenUI renderer; nothing else is supported.
 *
 * Dependency-free beyond React from the shared module table and the OpenUI
 * runtime passed in by the entry point.
 */
export function createLegacyExports(openuiRuntime, require) {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;
    const { useEffect, useMemo } = React;

    /** Read an optional service seat without letting an absent one throw. */
    function optionalSeat(ctx, name) {
      try { return ctx[name]; } catch { return undefined; }
    }

    const T = {
      subtitle: { color: "var(--dsw-alias-label-tertiary, GrayText)", fontSize: 12 },
      error: {
        border: "1px solid var(--dsw-alias-state-error-primary, #dc2626)",
        borderRadius: 10,
        padding: 12,
        color: "var(--dsw-alias-state-error-primary, #dc2626)",
        background: "var(--dsw-alias-bg-elevated, Canvas)",
        font: "12px/1.5 system-ui, sans-serif",
      },
      skeleton: {
        border: "1px solid var(--dsw-alias-border-l3, rgba(127,127,127,.3))",
        borderRadius: 12,
        padding: 16,
        color: "var(--dsw-alias-label-tertiary, GrayText)",
        background: "var(--dsw-alias-bg-elevated, Canvas)",
        font: "12px/1.5 system-ui, sans-serif",
      },
    };

    // ---------------------------------------------------------------------
    // Spec reading
    // ---------------------------------------------------------------------

    function readSpec(props) {
      if (props.spec && typeof props.spec === 'object') return {status:"ready",spec:props.spec};
      if (props.phase !== "result") return {status:"preparing"};
      if (props.block?.isError || props.block?.error) return {status:"error",message:"UI generation failed; inspect the tool result."};
      const meta=props.block?.meta;
      if (meta?.tool !== "render_ui" || meta.version !== 1 || !meta.spec) return {status:"error",message:"No validated OpenUI presentation is available for this recorded call."};
      return {status:"ready",spec:meta.spec};
    }

    class UiBoundary extends React.Component {
      constructor(props) { super(props); this.state={error:null}; }
      static getDerivedStateFromError(error) { return {error:String(error?.message ?? error)}; }
      render() { return this.state.error ? h("div",{style:T.error,role:"alert"},"Unable to display UI: ",this.state.error) : this.props.children; }
    }

    function RenderUi(props) {
      const parsed=readSpec(props);
      if (parsed.status === "preparing") return h("div",{style:T.skeleton},"Preparing interactive view…");
      if (parsed.status === "error") return h("div",{style:T.error,role:"alert"},parsed.message);
      const spec=parsed.spec;
      if (spec.view === 'mini-app' && spec.miniApp) {
        return h(UiBoundary, {key:spec.miniApp.code}, h(openuiRuntime.MiniAppView, {spec, selection:props.selection}));
      }
      if (spec.view !== "openui" || typeof spec.lang !== "string") {
        return h("div",{style:T.error,role:"alert"},"This presentation is not an OpenUI Lang view.");
      }
      const View = isDashboardLibrary(spec.library) ? openuiRuntime.DashboardView : openuiRuntime.OpenUiView;
      return h(UiBoundary,{key:spec.lang},h(View,{spec, actionBridge:props.actionBridge, toolBridge:props.toolBridge, persistFormState:props.persistFormState, selection:props.selection}));
    }

    const isFresh = time => {
      const age = Date.now() - time;
      return age >= 0 && age < 5000;
    };

    function ToolReceipt(props, ctx) {
      const args = props.block?.args;
      const read = key => {
        const value = typeof args?.text === 'function' ? args.text(key) : args?.[key];
        return typeof value === 'string' ? value : undefined;
      };
      const lang = props.phase === 'result' ? ''
        : (typeof args?.textPrefix === 'function' ? args.textPrefix('lang', 200000) : read('lang')?.slice(0, 200000));
      const placement = props.phase === 'result' ? undefined : read('placement');
      const library = props.phase === 'result' ? undefined : read('library');
      const title = props.phase === 'result' ? undefined : read('title')?.slice(0, 200);
      const {sessionId, callId, phase} = props;
      const sidebar = ctx && optionalSeat(ctx, 'sidebarRight');
      const failure = props.block?.isError || props.block?.error;
      const wantsDraft = placement === 'artifact' || (phase === 'start' && placement === undefined && isDashboardLibrary(library));
      const eligible = Boolean(sidebar && sessionId && callId && wantsDraft && openuiRuntime.updatePresentationDraft);
      useEffect(() => {
        if (phase === 'result' && failure && sessionId && callId) {
          openuiRuntime.failPresentationDraft?.(sessionId, callId);
        }
        if (!eligible || !(phase === 'preparing' || isFresh(props.block?.time)
          || openuiRuntime.hasPresentation?.(sessionId, callId))) return;
        if (sidebar.mounted && sidebar.mounted.getSnapshot() !== sessionId) return;
        const first = openuiRuntime.updatePresentationDraft(sessionId, callId, {
          view: 'openui', lang, library, title: title || 'Interactive preview',
        });
        if (first) {
          try { sidebar.openResource(openuiRuntime.presentationAddress(sessionId, callId)); }
          catch (error) { console.warn('render-ui: could not open draft', error); }
        }
      }, [phase, failure, sessionId, callId, sidebar, eligible, lang, library, title, props.block?.time]);
      if (phase !== "result") {
        if (eligible) return h("div", {style:T.subtitle}, "Preparing sidebar preview…");
        if(lang) {
          const View = isDashboardLibrary(library) ? openuiRuntime.DashboardView : openuiRuntime.OpenUiView;
          return h(UiBoundary,null,h(View,{spec:{lang,title:'Generating interactive view',library},isStreaming:true}));
        }
        return h("div",{style:T.skeleton},"Preparing interactive view…");
      }
      if (failure) return h("div",{style:T.error},"render_ui failed; inspect the tool result.");
      return h("div",{style:T.subtitle},"Interactive UI rendered below this step.");
    }

    /* Embed inside the existing module factory (uses its React binding).
     * Client inject must include both 'slots' and 'uiConversation'.
     * Call registerInlineNode(ctx, RenderUi) once from apply.
     * RenderUi receives { spec }, the already validated persisted spec, directly.
     * Host output.presentationMeta must emit { tool: 'render_ui', version: 1, spec }.
     * Existing tool-call projection is intentionally retained (no exclusive claim).
     */
    function registerInlineNode(ctx, RenderUi) {
      const kind = 'local-render-ui-inline';
      function resultState(match) {
        const event = match.event;
        return {
          seq: event.seq,
          time: event.time,
          callId: String(event.data.message.source.callId),
          spec: event.data.meta.spec,
        };
      }
      // The registry owns this contribution as a Cordis effect, including HMR cleanup.
      ctx.uiConversation.events.register({
        kind,
        target: 'chat',
        match: {
          'tool/result': function (event) {
            const data = event.data;
            const meta = data.meta;
            if (data.message.isError === true || data.error !== undefined
              || meta === null || typeof meta !== 'object' || Array.isArray(meta)
              || meta.tool !== 'render_ui' || meta.version !== 1
              || meta.spec === null || typeof meta.spec !== 'object' || Array.isArray(meta.spec)
              || !(meta.spec.view === 'openui' && typeof meta.spec.lang === 'string'
                || meta.spec.view === 'mini-app' && typeof meta.spec.miniApp?.code === 'string')) return null;
            // A result is a whole checkpoint: no tool/call or transient state needed.
            return { id: String(data.message.source.callId), role: 'start' };
          },
        },
        start: function (_context, match) { return resultState(match); },
        update: function (_context, match) { return resultState(match); },
        buildViewNode: function (context) {
          const state = context.state;
          if (state === undefined) return null;
          return {
            key: context.key,
            kind,
            id: context.id,
            target: 'chat',
            anchorSeq: state.seq,
            location: context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' },
            visibility: 'visible',
            // Outside both step-run grouping and completed-Turn process folding.
            groupTree: 'turn',
            data: { callId: state.callId, time: state.time, spec: state.spec },
          };
        },
      });
      function InlineRenderUi(props) {
        const toolBridge = useMemo(() => openuiRuntime.createToolBridge(ctx, props.sessionId), [props.sessionId]);
        const {spec, callId, time} = props.node.data;
        const selection = useMemo(() => createSelection(spec), [spec, props.sessionId, callId]);
        const sessionId = props.sessionId;
        const sidebarRight = optionalSeat(ctx, 'sidebarRight');
        const registerPresentation = openuiRuntime.registerPresentation;
        const canOpen = Boolean(sidebarRight && sessionId && callId && registerPresentation);
        const opensBesideChat = canOpen && spec.placement === 'artifact';
        const openInSidebar = () => {
          if (!canOpen) return;
          const contentId = registerPresentation(spec, spec.title, callId, sessionId, selection);
          sidebarRight.openResource(contentId);
        };
        useEffect(() => {
          if (!opensBesideChat) return;
          if (openuiRuntime.hasPresentation?.(sessionId, callId)) {
            registerPresentation(spec, spec.title, callId, sessionId, selection);
          } else if (isFresh(time)) {
            openInSidebar();
          }
        }, [opensBesideChat, time, sidebarRight, spec, sessionId, callId]);
        return React.createElement(
          "div",
          {className: opensBesideChat ? "dsh-artifact-preview" : "dsh-inline-presentation"},
          opensBesideChat
            ? React.createElement("strong", null, spec.title || "Interactive view")
            : React.createElement(RenderUi, {spec, actionBridge: openuiRuntime.createActionBridge(ctx, sessionId), toolBridge, selection}),
          canOpen ? React.createElement("div", {className: "dsh-artifact-actions"},
            React.createElement("button", {type: "button", onClick: openInSidebar, className: "dsh-artifact-button"},
              opensBesideChat ? "Open artifact" : "Open in sidebar"),
          ) : null,
        );
      }
      // The injector waits for the actual slot declaration and tracks registration
      // teardown/redeclaration automatically; do not add global hooks or DOM hacks.
      ctx.slots.inject('conversation.chat.node', function () {
        return ctx.slots.register({ name: 'conversation.chat.node', key: kind }, InlineRenderUi);
      });
    }

    function registerDeliveredSitePreview(ctx) {
      const kind = 'local-render-ui-site-delivery';
      const opened = new Set();
      function entryPath(files) {
        if (!Array.isArray(files)) return;
        const html = files.map(file => file?.path).filter(path => typeof path === 'string' && /\.html?$/i.test(path));
        return html.length === 1 ? html[0] : html.find(path => /(?:^|[/\\])index\.html?$/i.test(path));
      }
      ctx.uiConversation.events.register({
        kind,
        target: 'chat',
        match: {
          'deliverables/presented': event => {
            return Number.isSafeInteger(event.data?.turn) && entryPath(event.data.files)
              ? {id: String(event.seq), role:'start'} : null;
          },
        },
        start: (_context, match) => {
          const {seq, time, data} = match.event;
          return {seq, time, turn:data.turn, path:entryPath(data.files)};
        },
        buildViewNode: context => context.state && ({
          key: context.key, kind, id: context.id, target:'chat', anchorSeq:context.state.seq,
          location:context.start?.location ?? {kind:'unresolved'}, visibility:'visible', groupTree:'turn', data:context.state,
        }),
      });
      function DeliveredSite({node, sessionId}) {
        const {path, turn, time} = node.data;
        useEffect(() => {
          if (!sessionId || !path || !isFresh(time)) return;
          const sidebar = optionalSeat(ctx, 'sidebarRight');
          const key = JSON.stringify([sessionId, turn]);
          if (!sidebar || opened.has(key) || (sidebar.mounted && sidebar.mounted.getSnapshot() !== sessionId)) return;
          const cwd = optionalSeat(ctx, 'sessions')?.list.getSnapshot().byId[sessionId]?.cwd;
          try {
            sidebar.openResource(fileResourceAddress(sessionId, path, cwd));
            opened.add(key);
          } catch (error) { console.warn('render-ui: could not open delivered site', error); }
        }, [sessionId, path, turn, time]);
        return null;
      }
      ctx.slots.inject('conversation.chat.node', () =>
        ctx.slots.register({name:'conversation.chat.node', key:kind}, DeliveredSite));
    }

    /* Left sidebar entry: one `sidebar.panellist` row plus the matching root
     * `main` panel. The sidebar owns the button and resolves its label from the
     * registration metadata; the panel renders without a Session binding.
     */
    function registerSidebarEntry(ctx) {
      const {PANEL_ID, PANEL_NS, PANEL_DICTIONARIES, RenderUiIcon, RenderUiPanel} = openuiRuntime;
      ctx.effect(() => ctx.locale.register(PANEL_NS, PANEL_DICTIONARIES), "render-ui: panel dictionaries");
      const t = ctx.locale.bind(PANEL_NS);
      const workspace = () => optionalSeat(ctx, 'uiWorkspace');
      const workspaceFiles = () => {
        try { return ctx.remote?.workspaceFiles; }
        catch { return undefined; }
      };
      const openChat = sessionId => workspace().openSession(sessionId);
      const openFile = ({sessionId, address}) => {
        const sidebar = optionalSeat(ctx, 'sidebarRight');
        if (!sidebar) throw new Error('File preview unavailable');
        if (sidebar.mounted.getSnapshot() === sessionId) return sidebar.openResource(address);
        return new Promise((resolve, reject) => {
          const unsubscribe = sidebar.mounted.subscribe(() => {
            if (sidebar.mounted.getSnapshot() !== sessionId) return;
            unsubscribe();
            clearTimeout(timeout);
            queueMicrotask(() => {
              try { sidebar.openResource(address); resolve(); }
              catch (error) { reject(error); }
            });
          });
          const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error('Source chat unavailable'));
          }, 5000);
          try { openChat(sessionId); }
          catch (error) {
            unsubscribe();
            clearTimeout(timeout);
            reject(error);
          }
        });
      };
      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 20,
        locale: PANEL_NS,
        label: () => t("panel"),
      }, RenderUiIcon));
      ctx.slots.inject("main", () => ctx.slots.register({
        name: "main",
        key: PANEL_ID,
        locale: PANEL_NS,
        inject: () => ({
          t, sessions: optionalSeat(ctx, 'sessions'), openFile,
          openChat: workspace() ? openChat : undefined,
          workspaceFiles: workspaceFiles(),
        }),
      }, RenderUiPanel));
    }

    function apply(ctx) {
      // Activation must never fail the client boot: a composition that lacks an
      // optional seat still gets every surface that IS available.
      try { registerInlineNode(ctx, RenderUi); } catch (error) { console.warn('render-ui: inline node', error); }
      try { registerDeliveredSitePreview(ctx); } catch (error) { console.warn('render-ui: site delivery', error); }
      try {
        ctx.slots.inject("tool.call.toolview", () =>
          ctx.slots.register({ name: "tool.call.toolview", key: "render_ui" }, props => ToolReceipt(props, ctx)),
        );
      } catch (error) { console.warn('render-ui: toolview', error); }
      try { if (ctx.locale) registerSidebarEntry(ctx); } catch (error) { console.warn('render-ui: sidebar entry', error); }
      try { if (openuiRuntime.registerStatusLine) openuiRuntime.registerStatusLine(ctx); } catch (error) { console.warn('render-ui: status line', error); }
      try { if (openuiRuntime.registerSidebarPresentations) openuiRuntime.registerSidebarPresentations(ctx, {...openuiRuntime, RenderPresentation: RenderUi}); } catch (error) { console.warn('render-ui: sidebar presentations', error); }
    }

    exports.name = "@local/dsh-plugin-render-ui";
    exports.inject = ["slots", "uiConversation", "sessions", "connection", "locale", "sidebarRight", "sidebarRightTabs", "uiWorkspace", "remote", "remote.workspaceFiles"];
    exports.apply = apply;
    exports.__render = RenderUi;
    exports.__statusLine = openuiRuntime.LiveStatusLine;

    return module.exports;
}
