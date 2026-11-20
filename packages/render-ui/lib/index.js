/**
 * Host half of @local/dsh-plugin-render-ui.
 *
 * Registers the model-facing `render_ui` tool. The tool accepts OpenUI Lang
 * (plus an optional title and library); the client half (exports["./client"])
 * renders the validated presentation as an interactive card keyed by the wire
 * tool name through `tool.call.toolview`.
 */

import { normalizeSpec } from './validate.js';
import { readDataSnapshot } from './data-snapshot.js';
import {installToolExecution} from './tool-execution-host.js';
import openuiInstructions from './openui-instructions.json' with { type: 'json' };
import dashboardInstructions from './dashboard-instructions.json' with { type: 'json' };
import dashboardV2Instructions from './dashboard-v2-instructions.json' with { type: 'json' };

export const name = "render-ui";
export const inject = ["tools", "agents", "systemPrompt", "sessionProjections"];

const DESCRIPTION = [
  "Render rich general-purpose inline UI in the existing conversation using OpenUI Lang. Call ui_library first to obtain the COMPLETE generated component/language instructions, then pass lang (and optional title). The standard library includes forms, tabs, charts, layouts, maps and media; pass library \"dashboard\" for the dashboard layout grammar (Dashboard/Section/CardRow, filters, KPI cards, charts). Query/Mutation execute registered DSH tools through the session-scoped server executor with existing permissions; use Query only for reads and Mutation for user-triggered writes. Saved Queries re-fetch when reopened. Maximum lang 200000 characters.",
  "Dashboards default to the sidebar. For a substantial view or a sidebar request, pass placement: 'artifact' as the first argument field, before lang or miniApp, so the sidebar opens during generation. Use placement: 'inline' for focused charts and small controls.",
  "Use it when a visual helps the user decide, compare, or explore. Put the answer in the view and keep supplementary prose brief. Keep tables under 20 rows.",
].join(" ");

const UI_GUIDANCE = [
  "Choose the shortest complete format for the user's task. Answer a quick fact in a sentence. Use a focused inline chart for a trend, a compact table for exact comparisons, a slider for a what-if question, and a visual shortlist for options. Use the requested format and level of detail when specified.",
  "Lead with the answer or recommendation, either in the UI or in a short sentence. When a view carries the answer, skip the routine introduction and recap. Add chat prose only for a takeaway, important caveat, or next action that the view does not already communicate. Keep essential context and sources visible wherever the answer appears.",
  "For recommendations, show roughly three to five distinct options unless the user asks for more. Use a concise card per option with its name, the decision-relevant facts, and one reason to choose it. For places, include the area and best time when supported. Use a relevant sourced photo and alt text when an image tool or source supplies a reliable image URL. Omit unavailable photos and avoid guessing hours, prices, links, or other current details.",
  "For a visual shortlist of places or products, use RecommendationCards from the standard ui_library, including on follow-ups asking what a place looks like or what to pick instead. Put each named option, its own photo and photo source, and its alternative in the same Recommendation card. The whole card drafts the follow-up in the chat composer. Do not add a separate footer button or repeat the alternatives in chat. Add at most one decision-helping sentence unless the user requests more.",
  "Put secondary options and raw details behind a labeled disclosure or tab when available. For weather, show current conditions compactly or lead with the recommended time window and an hourly chart when timing matters. A full table is for users who want exact readings. Label the location, local forecast time, and source.",
  "Keep compact views inline. Pass placement 'artifact' first for dashboards, requested sidebar views, and substantial tools the user will work with beside the chat. For a generated local website, deliver the completed HTML entry file with present to open its native preview. The user chooses whether to save interactive artifacts.",
  "Before calling render_ui, call ui_library (library \"standard\" or \"dashboard\") to obtain the complete component/language instructions, then produce valid OpenUI Lang. The root is Stack (standard) or Dashboard (dashboard).",
  "Use component defaults when possible. In the standard library, Card(children) defaults to a vertical card. When specifying direction or gap, give Card its variant first: Card(children, \"card\", \"column\", \"s\"). For Stack, \"stretch\" is an align value (fourth argument), not a justify value (fifth argument).",
  "Data must come from actual tools or supplied data; label invented examples as mock. Query/Mutation execute registered DSH tools through the session-scoped server executor with existing permissions; use Query only for reads, Mutation only for writes after user interaction.",
  "If render_ui fails validation, use the reported statement and component to correct the affected calls. Keep the rest of the design and data unless the specific limit requires a change. Retry once with the targeted fix. Keep retry analysis out of user-facing prose. If the retry fails, briefly explain what could not render and provide a concise fallback.",
  "For a live dashboard about the harness itself, use session_stats and derive displayed numbers from its result. Use tools relevant to the user's task for other views.",
  "For computed chart or table data, write compact aggregate JSON as a regular file under .dsh-ui-data in the workspace, then pass its filename as dataFile to render_ui. Read the attached object with snapshot = Query(\"ui_snapshot\", {}, {}) and bind its fields. Do not paste the dataset into the Lang. Supply selectionKeys without the $ prefix for selectors the user may save. Keep credentials and sensitive free-text inputs out of saved selections.",
  "For an explicit artifact revision request, pass the supplied reference exactly as revisionOf to render_ui and edit the supplied source. Preserve existing snapshot bindings unless the user requests replacement data. The result is a draft until the user saves the revision.",
  "For bespoke local calculators or research explorers, render_ui can take miniApp instead of lang. Provide an HTML fragment with named controls and elements marked data-output=\"key\", optional CSS, and JavaScript declaring function calculate(inputs, data) that returns a flat object of text or numeric results keyed by the output names. Inputs and supplied snapshot data are the only inputs to the calculation. Keep DOM, file access, network, and host tools out of the code. List control names in selectionKeys to save their values.",
].join(" ");

/** Projection keys the live dashboard reads; each is client-visible and JSON-safe. */
const STATS_KEYS = [
  "contextPressure",
  "contextBreakdown",
  "tokenUsage",
  "sessionStats",
  "workingDirectory",
];

/**
 * Read one consistent cut of the live session projections for the tool call's
 * agent. Pure and synchronous: the projection registry folds the durable log
 * up to a single seq, so every field agrees.
 * @param ctx - plugin context carrying `sessionProjections`.
 * @param exec - tool run context carrying the calling `agent`.
 * @returns a JSON-safe snapshot, or `{ error }` when the session is unavailable.
 */
function readSessionStats(ctx, exec) {
  const agent = exec?.agent;
  const session = agent?.session;
  if (!session) return { error: "no-session" };
  const registry = ctx.sessionProjections;
  if (!registry || typeof registry.snapshot !== "function") {
    return { error: "projections-unavailable" };
  }
  const snapshot = registry.snapshot(session, STATS_KEYS);
  const values = snapshot?.values ?? {};
  const pressure = values.contextPressure ?? {};
  const usage = values.tokenUsage ?? {};
  const stats = values.sessionStats ?? {};
  const used = pressure.projectedTokens ?? pressure.pressureTokens ?? 0;
  const window = pressure.contextWindow ?? 0;
  const percent = window > 0 && used > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0;
  return {
    model: agent?.options?.model ?? null,
    workingDirectory: values.workingDirectory ?? null,
    context: {
      window,
      usedTokens: used,
      percent,
      pressureTokens: pressure.pressureTokens ?? null,
      projectedTokens: pressure.projectedTokens ?? null,
    },
    breakdown: values.contextBreakdown ?? null,
    tokens: {
      uncachedInput: usage.uncachedInputTokens ?? 0,
      cacheRead: usage.cacheReadTokens ?? 0,
      cacheWrite: usage.cacheWriteTokens ?? 0,
      output: usage.outputTokens ?? 0,
    },
    activity: stats.turns === undefined ? null : {
      turns: stats.turns,
      steps: stats.steps,
      llmMs: stats.llmMs,
      toolMs: stats.toolMs,
      ttftMs: stats.ttftMs,
      ttftSteps: stats.ttftSteps,
      decodeMs: stats.decodeMs,
      decodeTokens: stats.decodeTokens,
    },
    asOfSeq: snapshot?.asOfSeq ?? null,
  };
}

export function apply(ctx) {
  // Activation must never fail the host boot: a composition that lacks an
  // optional seat (a headless or ACP run has no `connection`, for example)
  // still loads the presentation surfaces that ARE available.
  try {
    installToolExecution(ctx);
    let dataContext = ctx;
    ctx.inject?.(['fs', 'workingDirectory'], scoped => {
      dataContext = scoped;
      scoped.effect?.(() => () => { if (dataContext === scoped) dataContext = ctx; });
    });
    // Register UI generation guidance in the system prompt (ordered, overridable per scope).
    if (ctx.systemPrompt && typeof ctx.systemPrompt.section === "function") {
      try { ctx.systemPrompt.section({ name: "render-ui:guidance", order: 420, text: () => UI_GUIDANCE }); } catch {}
    }
  // Observe assistant streams so UI-mode output can be detected/restored. Frames are
  // transient; durable state still comes from tool results (presentationMeta) and
  // session events. We keep the latest accumulated text per agent for diagnostics.
  const buffers = new Map();
  if (typeof ctx.on === "function") {
  ctx.on("agent/assistant-stream", ({ agent, frame }) => {
    if (!agent?.session?.id) return;
    let buf = buffers.get(agent.session.id);
    if (frame.type === "start") {
      buf = { text: "", attemptId: frame.attemptId };
      buffers.set(agent.session.id, buf);
      return;
    }
    if (!buf || buf.attemptId !== frame.attemptId) return;
    if (frame.type === "chunk" && frame.chunk?.type === "text-delta" && typeof frame.chunk.text === "string") {
      buf.text += frame.chunk.text;
      // Heuristic: detect an OpenUI Lang program being streamed.
      if (!buf.uiDetected && /\b(Stack|Dashboard)\s*\(/.test(buf.text) && buf.text.includes("render_ui") === false) {
        // mark only; do not mutate the stream
        buf.uiDetected = /\b(MetricIndicator|CardRow|SmallCard)\b/.test(buf.text);
      }
    }
    if (frame.type === "end") {
      // Retain a short tail for the most recent attempt; drop the rest.
      const tail = (buf.text || "").slice(-4000);
      buffers.set(agent.session.id, { text: tail, attemptId: frame.attemptId, ended: true, uiDetected: !!buf.uiDetected });
    }
  });
  }
  ctx.tools.register({
    name: 'ui_library',
    description: 'Get the complete OpenUI Lang instructions and full component catalog for render_ui. Pass library "standard" (default) for the general component library, or "dashboard" for the original dashboard layout grammar. Use "dashboard-v2" for the Dashboard/Section/Row/Card catalog.',
    parameters: {type:'object',additionalProperties:false,properties:{
      library: { type: 'string', enum: ['standard', 'dashboard', 'dashboard-v2'], description: 'Which component library instructions to return. Defaults to standard.' }
    }},
    output: {schema:{type:'string'},render(_args,value){return [{type:'text',text:String(value)}];}},
    async execute(args){
      if (args?.library === 'dashboard-v2') return dashboardV2Instructions.instructions;
      return args?.library === 'dashboard' ? dashboardInstructions.instructions : openuiInstructions.instructions;
    },
  });
  ctx.tools.register({
    name: "render_ui",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        placement: { type: 'string', enum: ['inline', 'artifact'], description: 'Pass artifact first to open the sidebar while generating. Dashboard library defaults to artifact. Standard library defaults to inline.' },
        lang: { type: 'string', description: 'OpenUI Lang program from the full ui_library instructions.' },
        miniApp: { type: 'object', additionalProperties: false, required: ['html', 'code'], properties: {
          html: {type: 'string', description: 'HTML fragment with named input/select controls and data-output markers.'},
          css: {type: 'string', description: 'Optional CSS for the isolated mini-app.'},
          code: {type: 'string', description: 'JavaScript declaring calculate(inputs, data), returning an object of scalar outputs. No DOM or host capabilities.'},
        }},
        title: { type: 'string', description: 'Optional title for the presentation, at most 200 characters.' },
        dataFile: { type: 'string', description: 'Optional JSON object filename in the session workspace .dsh-ui-data directory. Read it in the view with Query("ui_snapshot", {}, {}). Maximum 64 KiB.' },
        revisionOf: { type: 'string', description: 'Use the exact saved artifact revision reference supplied by the user to propose an update.' },
        selectionKeys: { type: 'array', items: {type: 'string'}, description: 'Up to 12 state binding names without $ to carry to the sidebar and save with the snapshot.' },
        library: { type: 'string', enum: ['standard', 'dashboard', 'dashboard-v2'], description: 'Component library: "standard" (default), "dashboard" (original dashboard grammar), or "dashboard-v2" (new dashboard grammar).' },
      },
    },
    output: {
      schema: { oneOf: [{type: "string"}, {type: "object"}] },
      render(_args, value) {
        return [{ type: "text", text: typeof value === 'string' ? value : 'Interactive UI prepared with a data snapshot.' }];
      },
      presentationMeta(args, value) {
        const spec = normalizeSpec(args);
        if (args.dataFile) spec.snapshot = value;
        if (args.selectionKeys?.length) spec.selectionKeys = args.selectionKeys;
        return { tool: 'render_ui', version: 1, spec };
      },
    },
    async execute(args, exec) {
      normalizeSpec(args);
      if (args.dataFile) return readDataSnapshot(dataContext, args.dataFile, exec);
      return args.miniApp ? "Mini-app draft prepared." : "Interactive UI prepared.";
    },
  });
  ctx.tools.register({
    name: "session_stats",
    description: [
      "Read the calling session's LIVE statistics for a dashboard: model, working directory, context-window occupancy (window, used tokens, percent, provider pressure vs projected), context breakdown (system/tools/messages), token usage (uncached input, cache read, cache write, output), and activity (turns, steps, LLM/tool wall time, TTFT, decode speed).",
      "Values are one consistent cut of the durable session log at call time. Use it from an OpenUI dashboard Query with a refreshInterval so the dashboard reloads without a new model turn.",
    ].join(" "),
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    output: {
      schema: { type: "object" },
      render(_args, value) {
        return [{ type: "text", text: JSON.stringify(value) }];
      },
    },
    async execute(_args, exec) {
      const stats = readSessionStats(ctx, exec);
      if (stats.error !== undefined) throw new TypeError(`session_stats: ${stats.error}`);
      return stats;
    },
  });
  } catch (error) {
    // Never let an optional seat's absence fail the whole composition.
    try { console.warn('[render-ui] host activation partial:', error); } catch {}
  }
}
