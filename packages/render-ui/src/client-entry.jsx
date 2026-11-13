import {createLegacyExports} from './legacy-client.js';
import {OpenUiView} from './openui-view.jsx';
import {DashboardView} from './dashboard-view.jsx';
import {MiniAppView} from './mini-app-view.jsx';
import {createActionBridge} from './action-bridge.js';
import css from '@openuidev/react-ui/index.css';
import artifactCss from './artifact.css';
import analyticsCss from './analytics.css';
import obsidianCss from './vendor/obsidian/components/block/analytics-dashboard.css';
import digitCss from './vendor/obsidian/components/analytics-dashboard/number-animation.module.css';
import {createToolBridge} from './tool-bridge.js';
import {registerStatusLine, LiveStatusLine} from './status-line.jsx';
import {
  registerSidebarPresentations,
  registerPresentation,
  presentationAddress,
  updatePresentationDraft,
  failPresentationDraft,
  hasPresentation,
} from './sidebar-presentations.jsx';
import {
  RenderUiIcon,
  RenderUiPanel,
  PANEL_ID,
  PANEL_NS,
  PANEL_DICTIONARIES,
} from './sidebar-panel.jsx';
const legacy = createLegacyExports({
  OpenUiView,
  DashboardView,
  MiniAppView,
  createActionBridge,
  createToolBridge,
  RenderUiIcon,
  RenderUiPanel,
  PANEL_ID,
  PANEL_NS,
  PANEL_DICTIONARIES,
  registerStatusLine,
  LiveStatusLine,
  registerSidebarPresentations,
  registerPresentation,
  presentationAddress,
  updatePresentationDraft,
  failPresentationDraft,
  hasPresentation,
}, require);

/* The OpenUI component stylesheet is injected once and scoped to this
 * plugin's surface: its `:root` defaults must not leak into the host shell.
 * The per-view ThemeProvider layers the active light/dark tokens on top.
 */
function applyWithStyles(ctx) {
  if (typeof document !== 'undefined' && !document.getElementById('dsh-openui-styles')) {
    const style = document.createElement('style');
    style.id = 'dsh-openui-styles';
    style.textContent = css.replaceAll(':root', '.dsh-openui-surface') + '\n' + artifactCss + '\n' + obsidianCss + '\n' + digitCss + '\n' + analyticsCss;
    document.head.appendChild(style);
    ctx.effect?.(() => () => style.remove());
  }
  return legacy.apply(ctx);
}

export const name=legacy.name;
export const inject=legacy.inject;
export const apply=applyWithStyles;
export const __render=legacy.__render;
export const __statusLine=legacy.__statusLine;
