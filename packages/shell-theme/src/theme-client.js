window.__ModuleLoader__.load({
  id:'@local/dsh-shell-theme',
  factory(require) {
    const React=require('react'),h=React.createElement;
    /*__ANIMATED_ICONS__*/
    const useStore=store=>React.useSyncExternalStore(React.useCallback(cb=>store.subscribe(cb),[store]),()=>store.getSnapshot());
    function PinnedRow({session,active,unpinAccess,open,unpin}) {
      const allowed=useStore(unpinAccess);
      const [pending,setPending]=React.useState(false),[error,setError]=React.useState('');
      const title=(session.displayTitle||session.title||'').trim()||'Untitled chat';
      return h('li',null,h('div',{className:'shell-pinned-row'},
        h('button',{type:'button',className:'shell-pinned-open','aria-current':active?'page':undefined,title,onClick:()=>open(session.id)},title),
        allowed&&h('button',{type:'button',className:'shell-pinned-unpin',title:'Unpin chat','aria-label':`Unpin ${title}`,disabled:pending,onClick:async()=>{setPending(true);setError('');try{await unpin(session.id);}catch{setError('Could not unpin. Try again.');}finally{setPending(false);}}},
          h('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:'m3 3 18 18M9 9l-3 3 6 6 3-3m-3-9 3-3 6 6-3 3M3 21l5-5'})))),error&&h('p',{role:'alert',className:'shell-pinned-error'},error));
    }
    function Pinned({children,wide,workspaces,sessions,access,open,unpin}) {
      const ws=useStore(workspaces),ss=useStore(sessions);
      const [expanded,setExpanded]=React.useState(()=>{try{return localStorage.getItem('dsh.shell.pinned.collapsed')!=='true';}catch{return true;}});
      const archived=new Set(ws.archivedSessionIds??[]);
      const ids=[...new Set(ws.pinnedSessionIds??[])].filter(id=>!archived.has(id));
      const rows=ids.map(id=>ss.byId?.[id]).filter(s=>s&&s.origin!=='subagent'&&!s.blank);
      if(!wide)return children;
      const loading=ws.phase!=='ready'||ss.phase!=='ready';
      return h('div',{className:'shell-pinned-wrap'},children,h('details',{className:'shell-pinned',open:expanded,onToggle:event=>{
        const next=event.currentTarget.open;setExpanded(next);try{localStorage.setItem('dsh.shell.pinned.collapsed',String(!next));}catch{}
      }},h('summary',null,h('span',null,'Pinned'),h('svg',{width:12,height:12,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,'aria-hidden':true},h('path',{d:'m9 5 7 7-7 7'}))),
        loading?h('p',{role:'status',className:'shell-pinned-empty'},'Loading pinned chats…'):rows.length?h('ul',{'aria-label':'Pinned chats'},rows.map(session=>h(PinnedRow,{key:session.id,session,active:(session.retainedBy?.mainView??0)>0,unpinAccess:access(session.id),open,unpin}))):h('p',{className:'shell-pinned-empty'},'Pin chats from their menu.')));
    }
    // Original outline artwork, embedded locally: no icon font or network fetch.
    const iconPaths={
      grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
      // Calendar Clock: Avijit Dey / AnimateIcons, MIT; see THIRD-PARTY-NOTICES.md.
      calendar:'<path d="M8 2v4M16 2v4M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M3 10h5"/><circle cx="16" cy="16" r="6"/>',
      clockHands:'<path d="M16 14v2.2l1.6 1"/>',
      artifacts:'<rect x="7" y="3" width="14" height="16" rx="3"/><path d="M16 21H6a3 3 0 0 1-3-3V8m8-1h6m-6 4h6m-6 4h3"/>',
      more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      dream:'<path d="M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10Zm-3-11v5m-2-2h4"/>',
      chart:'<path d="M4 3v17h17M8 15v-4m5 4V7m5 8v-6"/>',
      board:'<rect x="3" y="3" width="18" height="15" rx="3"/><path d="m8 13 2-4 5-3 2 2-3 5-4 2Zm0 9 4-4 4 4"/>',
      desktop:'<rect x="3" y="3" width="18" height="14" rx="3"/><path d="M8 21h8m-4-4v4m-5-10 3-3 3 3 4-4"/>',
      compose:'<path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-6M16 3l5 5m-2-7 4 4-12 12-5 1 1-5Z"/>'
    };
    const icon=name=>'url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+iconPaths[name]+'</svg>')+'")';
    // Selectors verified against installed SidebarRoot, InputBar and attachment modules.
    // If an update renames the module, this pass becomes inert rather than
    // accidentally styling unrelated panels, editors, or rendered artifacts.
    const CSS = `
.wtg9ga_root {
  --shell-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --shell-motion: 120ms;
  --shell-ease: cubic-bezier(.16,1,.3,1);
  font-family: var(--shell-font);
  font-size: 14px;
  line-height: 1.45;
}
.wtg9ga_root button, .wtg9ga_root input, .wtg9ga_root select {
  font-family: var(--shell-font);
}
.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_brandName {
  font-weight: 600;
  letter-spacing: -.02em;
}
.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_panelEntry {
  border-radius: 10px;
  transition: background-color var(--shell-motion) var(--shell-ease);
}
.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_panelRow {
  min-height: 36px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 400;
}
.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_newSession {
  min-height: 36px;
  border-radius: 10px;
  border-color: transparent;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  transition: background-color var(--shell-motion) var(--shell-ease);
}
.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_newSession:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.wtg9ga_root .wtg9ga_panelTitle { line-height: 1.45; }
.wtg9ga_root .wtg9ga_iconButton {
  border-radius: 8px;
  transition: background-color var(--shell-motion) var(--shell-ease), color var(--shell-motion) var(--shell-ease);
}
.wtg9ga_root button:focus-visible, .wtg9ga_root a:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-label-primary));
  outline-offset: -2px;
}
@media (prefers-reduced-motion: reduce) {
  .wtg9ga_root { --shell-motion: 0ms; }
}
.GRgSLq_root {
  --shell-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --shell-motion: 120ms;
  --shell-ease: cubic-bezier(.16,1,.3,1);
}
.GRgSLq_root .GRgSLq_card {
  --dsw-font-family: var(--shell-font);
  font-family: var(--shell-font);
  border-radius: 24px;
  padding-top: 10px;
  gap: 10px;
}
.GRgSLq_root .GRgSLq_card:not(.GRgSLq_cardWorkspaceTrigger) {
  box-shadow: 0 2px 8px #00000008;
  transition: box-shadow var(--shell-motion) var(--shell-ease);
}
.GRgSLq_root .GRgSLq_card:not(.GRgSLq_cardWorkspaceTrigger):focus-within {
  box-shadow: 0 3px 12px #0000000a;
}
/* Keep the editor and its absolutely positioned placeholder aligned.
   Leave contenteditable, paragraph metrics, auto-grow and scroll cap untouched. */
.GRgSLq_root .GRgSLq_input { padding: 6px 14px 2px 18px; }
.GRgSLq_root .GRgSLq_placeholder { inset: 6px 14px auto 18px; }
.GRgSLq_root .GRgSLq_row { padding: 2px 10px 10px; gap: 8px; }
.GRgSLq_root .GRgSLq_accessory { padding: 8px 18px 0; }
.GRgSLq_root .GRgSLq_row button, .GRgSLq_root .GRgSLq_row select {
  font-family: var(--shell-font);
}
.GRgSLq_root .GRgSLq_add {
  width: 32px;
  height: 32px;
  background: transparent;
  transition: background-color var(--shell-motion) var(--shell-ease), scale 100ms ease-out;
}
.GRgSLq_root .GRgSLq_select { border-radius: 8px; }
.GRgSLq_root .GRgSLq_primary {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-inverted);
  transition: opacity var(--shell-motion) var(--shell-ease), scale 100ms ease-out;
}
@media (prefers-reduced-motion: no-preference) {
  .GRgSLq_root .GRgSLq_add:active:not(:disabled),
  .GRgSLq_root .GRgSLq_primary:active:not(:disabled) { scale: .97; }
}
.GRgSLq_root .GRgSLq_row button:focus-visible,
.GRgSLq_root .GRgSLq_row select:focus-visible,
.GRgSLq_root .yTDIAG_rail button:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-label-primary));
  outline-offset: 2px;
}
.GRgSLq_root .yTDIAG_rail { padding: 2px 18px 0; }
.GRgSLq_root .yTDIAG_thumbnail { border-radius: 14px; }
.GRgSLq_root .EEnIVa_card { border-radius: 14px; max-width: 100%; }
.GRgSLq_root .yTDIAG_remove, .GRgSLq_root .EEnIVa_remove {
  width: 22px;
  height: 22px;
  top: 4px;
  right: 4px;
  opacity: .85;
  transition: opacity var(--shell-motion) var(--shell-ease);
}
.GRgSLq_root .EEnIVa_name,
.GRgSLq_root .EEnIVa_card:hover .EEnIVa_name,
.GRgSLq_root .EEnIVa_card:focus-within .EEnIVa_name { padding-right: 24px; }
.GRgSLq_root .EEnIVa_removeFailed { opacity: 1; }
@media (hover: hover) {
  .GRgSLq_root .GRgSLq_add:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
  .GRgSLq_root .GRgSLq_primary:hover:not(:disabled) { background: var(--dsw-alias-label-primary); opacity: .85; }
  .GRgSLq_root .yTDIAG_remove:hover, .GRgSLq_root .EEnIVa_remove:hover { opacity: 1; }
}
@media (max-width: 480px) {
  .GRgSLq_root .GRgSLq_card { border-radius: 20px; }
  .GRgSLq_root .GRgSLq_input { padding-inline-start: 14px; }
  .GRgSLq_root .GRgSLq_placeholder { inset-inline-start: 14px; }
  .GRgSLq_root .yTDIAG_rail { padding-inline: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .GRgSLq_root { --shell-motion: 0ms; }
  .GRgSLq_root .GRgSLq_add, .GRgSLq_root .GRgSLq_primary { transition: none; scale: none; }
}
/* Chat: preserve the user's font-size setting, message widths, virtualization
   and code/table metrics. Only the narrative surface receives UI typography. */
.xMeOpW_root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.65;
}
.xMeOpW_body { --dsh-assistant-block-gap: 18px; }
[data-chat-group-part="reasoning"] .xMeOpW_body { --dsh-assistant-block-gap: 4px; }
.V4vHZW_flowItem[data-chat-group-part="response"] { --dsh-chat-flow-gap: 18px; }
.xMeOpW_actions { margin-top: 12px; }
._1KfHza_actions ._1KfHza_action {
  border-radius: 8px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
/* Settings stays in its existing responsive grid; no new sizing or scrolling. */
.AnXs9G_panel {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
.AnXs9G_panel button, .AnXs9G_panel input, .AnXs9G_panel select,
.AnXs9G_panel textarea { font-family: inherit; }
.AnXs9G_navCell {
  border-radius: 10px;
  transition: background-color 120ms ease-out;
}
.AnXs9G_navTitle { font-size: 18px; font-weight: 600; letter-spacing: -.02em; }
.AnXs9G_close { border-radius: 50%; }
.AnXs9G_panel button:focus-visible, .AnXs9G_panel input:focus-visible,
.AnXs9G_panel select:focus-visible, .AnXs9G_panel textarea:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-label-primary));
  outline-offset: -2px;
}
@media (min-width: 768px) {
  .AnXs9G_panel { border-radius: 24px; }
}
/* Known shell menus only: do not apply generic role selectors to user artifacts.
   Keep host placement, active-item highlighting and keyboard navigation. */
.pc3rQa_menu, ._5Qcc8a_signedOutMenu[role="menu"], .wtg9ga_moreMenu {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border-radius: 16px;
  padding: 6px;
}
.pc3rQa_menu .pc3rQa_item,
._5Qcc8a_signedOutMenu [role="menuitem"], .wtg9ga_moreMenu [role="menuitem"] {
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.45;
  min-height: 36px;
  padding: 8px 10px;
}
@media (prefers-reduced-motion: reduce) {
  ._1KfHza_actions ._1KfHza_action, .AnXs9G_navCell { transition: none; }
}
/* Model and command pickers: keep native anchors, measured bounds, selection
   and scroll containers. Portal surfaces need their own typography. */
._9r0rkG_menu, .j99sVW_card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
  border-radius: 16px;
  padding: 6px;
}
._9r0rkG_root ._9r0rkG_trigger { border-radius: 8px; font-family: inherit; }
._9r0rkG_menu ._9r0rkG_option, .j99sVW_card .j99sVW_row {
  border-radius: 10px;
  min-height: 36px;
  padding: 8px 10px;
}
._9r0rkG_menu ._9r0rkG_cell {
  height: 36px;
  padding-inline: 10px;
  border-radius: 10px;
  font-size: 14px;
}
._9r0rkG_menu ._9r0rkG_modelName,
.j99sVW_card .j99sVW_labelText { font-size: 14px; line-height: 20px; }
._9r0rkG_menu ._9r0rkG_searchRow ._9r0rkG_search,
.j99sVW_card .j99sVW_search {
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover);
  padding: 8px 10px;
}
._9r0rkG_menu ._9r0rkG_searchRow ._9r0rkG_searchWithQuery { padding-right: 34px; }
._9r0rkG_menu ._9r0rkG_search input,
.j99sVW_card .j99sVW_search { font-family: inherit; font-size: 14px; }
._9r0rkG_menu ._9r0rkG_search:has(input:focus-visible),
.j99sVW_card .j99sVW_search:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 65%, transparent);
  outline-offset: -2px;
}
/* Scoped dialog cards: preserve host focus traps, modal layers, sizing,
   form actions, loading states and dismiss handlers. */
.cS6V_W_dialog.cS6V_W_dialog, .Fi3Lcq_guideDialog,
.TLFO4W_dialog, .J8V0KW_dialog {
  border-radius: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.cS6V_W_dialog .cS6V_W_detail {
  border-radius: 12px;
  border-color: transparent;
  background: var(--dsw-alias-interactive-bg-hover);
}
.cS6V_W_dialog .cS6V_W_detail:focus {
  border-color: transparent;
  box-shadow: none;
}
.cS6V_W_dialog .cS6V_W_detail:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 65%, transparent);
  outline-offset: -2px;
}
.cS6V_W_dialog .cS6V_W_chip { border-radius: 8px; }
.cS6V_W_dialog .cS6V_W_chip:not(.cS6V_W_chipActive) {
  border-color: transparent;
  background: var(--dsw-alias-interactive-bg-hover);
}
.cS6V_W_dialog .cS6V_W_submit { border-radius: 12px; }
.Fi3Lcq_guideDialog .Fi3Lcq_guideClose,
.J8V0KW_dialog .J8V0KW_close { border-radius: 50%; }
.TLFO4W_dialog .TLFO4W_title,
.Fi3Lcq_guideDialog .Fi3Lcq_guideTitle,
.J8V0KW_dialog .J8V0KW_title { font-weight: 600; letter-spacing: -.02em; }
.J8V0KW_dialog .J8V0KW_primaryButton,
.J8V0KW_dialog .J8V0KW_secondaryButton { border-radius: 10px; }
.J8V0KW_dialog .J8V0KW_secondaryButton {
  border-color: transparent;
  background: var(--dsw-alias-interactive-bg-hover);
}
/* Consistency pass: use surface contrast for normal fields; preserve native
   validation/error borders, checkboxes and radio buttons. No blanket resets. */
.AnXs9G_panel input:is([type="text"],[type="search"],[type="password"],[type="email"],[type="url"],[type="number"]):not([aria-invalid="true"]):not(:invalid) {
  border-color: transparent;
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover);
}
:is(.cS6V_W_dialog,.Fi3Lcq_guideDialog,.TLFO4W_dialog,.J8V0KW_dialog) button:focus-visible,
._9r0rkG_menu button:focus-visible, .j99sVW_card [role="option"]:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-label-primary));
  outline-offset: -2px;
}
@media (pointer: coarse) {
  ._9r0rkG_menu ._9r0rkG_search input,
  .j99sVW_card .j99sVW_search { font-size: 16px; }
}
/* Shared primitives verified in the installed frontend asset, not guessed
   from role attributes. Preserve anchor calculations and compact/dense modes. */
._list_70kcw_7[role="menu"], ._submenu_70kcw_8[role="menu"] {
  --dsw-elevation-stroke-color: transparent;
  border-radius: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
:is(._list_70kcw_7,._submenu_70kcw_8):not(._compactList_70kcw_218):not(._denseList_70kcw_209) {
  padding: 6px;
}
:is(._list_70kcw_7,._submenu_70kcw_8):not(._compactList_70kcw_218):not(._denseList_70kcw_209) ._item_70kcw_173 {
  min-height: 36px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 20px;
}
._list_70kcw_7 ._item_70kcw_173:focus-visible,
._submenu_70kcw_8 ._item_70kcw_173:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 65%, transparent);
  outline-offset: -2px;
}
.GRgSLq_root ._86kJGG_trigger, .AnXs9G_panel ._1jfq5W_selector {
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
._dialog_1ytzq_33[role="dialog"] {
  --dsw-elevation-stroke-color: transparent;
  border-radius: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
._dialog_1ytzq_33 ._title_1ytzq_79 { font-weight: 600; letter-spacing: -.02em; }
._dialog_1ytzq_33 ._close_1ytzq_103 { border-radius: 50%; }
._dialog_1ytzq_33 ._button_1ulci_2 { border-radius: 10px; }
._dialog_1ytzq_33 ._outline_1ulci_56 {
  border-color: transparent;
  background: var(--dsw-alias-interactive-bg-hover);
}
._dialog_1ytzq_33 button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 65%, transparent);
  outline-offset: -2px;
}
/* Native sidebar layout: component buttons stay in their original slots. */

/* One material across the rail and adjacent chat pane. No divider or tint. */
.wtg9ga_root .wtg9ga_panelList,
.wtg9ga_root .wtg9ga_scrollRegion,
.wtg9ga_root .wtg9ga_scrollArea,
.wtg9ga_root .wtg9ga_regionArea,
.wtg9ga_root .wtg9ga_footArea { background: transparent; }
/* Replace only icon artwork. Original buttons, labels, state and handlers stay. */
.wtg9ga_root .wtg9ga_panelRow { --shell-nav-icon: none; }
.wtg9ga_root .wtg9ga_panelRow[aria-label="Plugins"] { --shell-nav-icon: ${icon('grid')}; }
.wtg9ga_root .wtg9ga_panelRow[aria-label="Sina"] { --shell-nav-icon: none; }
.wtg9ga_root .wtg9ga_panelRow:is([aria-label="Schedules"],[aria-label="Automation tasks" i]) { --shell-nav-icon: ${icon('calendar')}; }
.wtg9ga_root .wtg9ga_panelRow[aria-label="Artifacts"] { --shell-nav-icon: ${icon('artifacts')}; }
.wtg9ga_root .wtg9ga_panelRow[aria-label="Dreamer"] { --shell-nav-icon: ${icon('dream')}; }
.wtg9ga_root .wtg9ga_panelRow[aria-label*="Power BI"],
.wtg9ga_root .wtg9ga_panelRow[aria-label*="PowerBI"] { --shell-nav-icon: ${icon('chart')}; }
.wtg9ga_root .wtg9ga_panelRow[aria-label*="Whiteboard"] { --shell-nav-icon: ${icon('board')}; }
.wtg9ga_root .wtg9ga_panelRow[aria-label*="Desktop"] { --shell-nav-icon: ${icon('desktop')}; }
.wtg9ga_root .wtg9ga_panelRow[aria-haspopup="menu"] { --shell-nav-icon: ${icon('more')}; }
.wtg9ga_root .wtg9ga_panelGlyph {
  position: relative;
  width: 20px;
  height: 20px;
}
.wtg9ga_root .wtg9ga_panelGlyph > * { visibility: visible; }
.wtg9ga_root .wtg9ga_panelRow:is([aria-label="Plugins"],:is([aria-label="Schedules"],[aria-label="Automation tasks" i]),[aria-label="Artifacts"],[aria-label="Dreamer"],[aria-label*="Power BI"],[aria-label*="PowerBI"],[aria-label*="Whiteboard"],[aria-label*="Desktop"],[aria-haspopup="menu"]) .wtg9ga_panelGlyph > * { visibility: hidden; }
.wtg9ga_root .wtg9ga_panelRow:is([aria-label="Plugins"],:is([aria-label="Schedules"],[aria-label="Automation tasks" i]),[aria-label="Artifacts"],[aria-label="Dreamer"],[aria-label*="Power BI"],[aria-label*="PowerBI"],[aria-label*="Whiteboard"],[aria-label*="Desktop"],[aria-haspopup="menu"]) .wtg9ga_panelGlyph::after { background: currentColor; }
.wtg9ga_root .wtg9ga_panelGlyph::after {
  content: '';
  position: absolute;
  inset: 0;
  background: transparent;
  mask-image: var(--shell-nav-icon);
  mask-size: contain;
  mask-position: center;
  mask-repeat: no-repeat;
  pointer-events: none;
}
.wtg9ga_root .wtg9ga_panelRow:is([aria-label="Schedules"],[aria-label="Automation tasks" i]) .wtg9ga_panelGlyph::before {
  content: ''; position: absolute; inset: 0; background: currentColor;
  mask: ${icon('clockHands')} center / contain no-repeat;
  transform-origin: 66.667% 66.667%; pointer-events: none;
}
.wtg9ga_root .wtg9ga_newSessionContent > svg { display: none; }
.wtg9ga_root .wtg9ga_newSessionContent::before {
  content: '';
  flex: none;
  width: 18px;
  height: 18px;
  background: currentColor;
  mask: ${icon('compose')} center / contain no-repeat;
  pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
  .wtg9ga_root .wtg9ga_panelGlyph::after {
    transition: transform 140ms cubic-bezier(.16,1,.3,1);
  }
  .wtg9ga_root .wtg9ga_panelRow:hover .wtg9ga_panelGlyph::after { transform: translateY(-1px); }
  .wtg9ga_root .wtg9ga_panelRow:active .wtg9ga_panelGlyph::after { transform: scale(.94); }
  .wtg9ga_root .wtg9ga_panelRow:is([aria-label="Schedules"],[aria-label="Automation tasks" i]):hover .wtg9ga_panelGlyph::after { transform: none; }
  .wtg9ga_root .wtg9ga_panelRow:is([aria-label="Schedules"],[aria-label="Automation tasks" i]):hover .wtg9ga_panelGlyph::before {
    animation: shell-clock-hands 1.1s cubic-bezier(.34,1.4,.64,1);
  }
  @keyframes shell-clock-hands { 0%,54% { opacity: 0; transform: rotate(-40deg); } 55% { opacity: 1; } 80% { transform: rotate(12deg); } 100% { opacity: 1; transform: rotate(0); } }
}

/* Adjacent workspace pane: restyle the native live list and search controls.
   Group expansion, saved view mode, pinning and row actions remain host-owned. */
.wtg9ga_root .GAkraW_root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .GAkraW_sectionLabel {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .GAkraW_iconButton,
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .GAkraW_searchButton,
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .GAkraW_clearButton { border-radius: 8px; }
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .GAkraW_searchExpanded {
  border-color: transparent;
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover);
}
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .GAkraW_search:has(.GAkraW_searchInput:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 65%, transparent);
  outline-offset: -2px;
}
.wtg9ga_root .GAkraW_searchInput { font-family: inherit; }
.shell-animated-host { position: relative; }
.shell-animated-host > :not(.shell-animated-mount) { visibility: hidden; }
.wtg9ga_root .wtg9ga_panelRow .wtg9ga_panelGlyph.shell-animated-host > .shell-animated-mount,
.shell-animated-host > .shell-animated-mount { visibility: visible; }
.wtg9ga_root .wtg9ga_panelRow .wtg9ga_panelGlyph.shell-animated-host::before,
.wtg9ga_root .wtg9ga_panelRow .wtg9ga_panelGlyph.shell-animated-host::after { display: none; }
.shell-animated-mount { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.shell-animated-mount > div { display: inline-flex; align-items: center; justify-content: center; }
.shell-inline-icon-host { display: inline-flex; position: relative; flex: none; width: 20px; height: 20px; }
.wtg9ga_root .wtg9ga_newSessionContent.shell-inline-icon-parent::before { display: none; }
.wtg9ga_root .wtg9ga_panelRow .wtg9ga_panelGlyph.shell-animated-host .shell-animated-mount svg,
.wtg9ga_root .GAkraW_iconButton.shell-animated-host .shell-animated-mount svg,
.shell-animated-host .shell-animated-mount svg { display: block; width: 20px; height: 20px; overflow: visible; }
.wtg9ga_root .GAkraW_searchButton.shell-animated-host .shell-animated-mount svg,
.wtg9ga_root .GAkraW_headerActions .GAkraW_iconButton.shell-animated-host .shell-animated-mount svg {
  width: 16px;
  height: 16px;
}
._1KfHza_actions ._1KfHza_action.shell-animated-host .shell-animated-mount svg,
._1KfHza_actions .Hyy-Wa_action.shell-animated-host .shell-animated-mount svg {
  width: 11px;
  height: 11px;
}
._1KfHza_actions[data-clock="end"] ._1KfHza_action.shell-animated-host .shell-animated-mount svg,
._1KfHza_actions[data-clock="end"] .Hyy-Wa_action.shell-animated-host .shell-animated-mount svg {
  width: 11px;
  height: 11px;
}
.shell-pinned-wrap{display:flex;flex-direction:column;width:100%;min-width:0;gap:12px}
.shell-pinned{width:100%;min-width:0;font:14px/1.45 var(--shell-font,system-ui)}
.shell-pinned summary{display:flex;align-items:center;gap:6px;padding:8px 12px;list-style:none;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;border-radius:8px}
.shell-pinned summary::-webkit-details-marker{display:none}.shell-pinned[open] summary svg{transform:rotate(90deg)}
.shell-pinned ul{list-style:none;margin:0;padding:0;max-height:min(28vh,216px);overflow-y:auto;overscroll-behavior:contain}
.shell-pinned-row{display:flex;align-items:center;min-width:0;border-radius:10px;min-height:36px}
.shell-pinned-row:hover,.shell-pinned-row:has([aria-current=page]){background:var(--dsw-alias-interactive-bg-hover)}
.shell-pinned-open{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:start;padding:8px 12px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.shell-pinned-unpin{display:grid;place-items:center;flex:none;width:28px;height:28px;margin-inline-end:4px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.shell-pinned-unpin:disabled{opacity:.5;cursor:wait}.shell-pinned-unpin:hover{background:var(--dsw-alias-interactive-bg-hover)}
.shell-pinned-empty,.shell-pinned-error{margin:4px 12px 8px;color:var(--dsw-alias-label-secondary);font-size:12px}.shell-pinned-error{color:var(--dsw-alias-state-error-primary)}
.shell-pinned button:focus-visible,.shell-pinned summary:focus-visible{outline:2px solid var(--dsw-focus-ring-color,currentColor);outline-offset:-2px}
@media(prefers-reduced-motion:no-preference){.shell-pinned summary svg{transition:transform 120ms ease-out}}
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .wnFoaW_projectRow,
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .wnFoaW_sessionRow {
  height: 36px;
  border-radius: 10px;
}
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .wnFoaW_projectText,
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .wnFoaW_title {
  font-family: inherit;
  font-size: 14px;
  line-height: 20px;
}
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .GAkraW_groupSection + .GAkraW_groupSection { margin-top: 8px; }
.wtg9ga_root .GAkraW_root:not(.GAkraW_rail) .wnFoaW_searchResultRow { border-radius: 10px; }
@media (pointer: coarse) {
  .wtg9ga_root .GAkraW_searchInput { font-size: 16px; }
}

/* Frosted shell surfaces. Never filter the sidebar itself: its native rail
   controls use fixed positioning and CSS anchors. Keep all content opaque. */
@supports (backdrop-filter: blur(1px)) and (background: color-mix(in srgb, white, transparent)) {
  @media (prefers-reduced-transparency: no-preference) and (forced-colors: none) {
    .wtg9ga_root,
    html[data-windows-titlebar] .wtg9ga_root:not(.wtg9ga_collapsed):not([role="dialog"]),
    html[data-windows-titlebar] .wtg9ga_root.wtg9ga_collapsed:not([role="dialog"]) {
      background:
        linear-gradient(145deg, color-mix(in srgb, var(--dsw-alias-label-primary-inverted) 12%, transparent), transparent 65%),
        color-mix(in srgb, var(--dsw-specific-sidebar-fill) 82%, transparent);
      box-shadow: inset -1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
    }
    .GRgSLq_root .GRgSLq_card:not(.GRgSLq_cardWorkspaceTrigger),
    .pc3rQa_menu, ._5Qcc8a_signedOutMenu[role="menu"], .wtg9ga_moreMenu,
    ._9r0rkG_menu, .j99sVW_card, ._list_70kcw_7 {
      background: color-mix(in srgb, var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1)) 86%, transparent);
      -webkit-backdrop-filter: blur(20px) saturate(125%);
      backdrop-filter: blur(20px) saturate(125%);
      box-shadow: inset 0 1px color-mix(in srgb, var(--dsw-alias-label-primary-inverted) 22%, transparent),
        0 8px 28px #00000014, 0 0 0 1px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
    }
    .GRgSLq_root .GRgSLq_card:not(.GRgSLq_cardWorkspaceTrigger):focus-within {
      box-shadow: inset 0 1px color-mix(in srgb, var(--dsw-alias-label-primary-inverted) 26%, transparent),
        0 10px 32px #0000001a, 0 0 0 1px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
    }
  }
}

/* Windows acrylic must reach the native window through every shell layer.
   Keep global tool pages, document canvases and drawer surfaces opaque. */
@media (prefers-reduced-transparency: no-preference) and (forced-colors: none) {
  html[data-windows-titlebar], html[data-windows-titlebar] body,
  html[data-windows-titlebar] #root,
  html[data-windows-titlebar] .mP3x-q_frame,
  html[data-windows-titlebar] .mP3x-q_frame::before,
  html[data-windows-titlebar] .mP3x-q_sidebarCol {
    background: transparent;
  }
  html[data-windows-titlebar] .wtg9ga_root:not(.wtg9ga_collapsed):not([role="dialog"]),
  html[data-windows-titlebar] .wtg9ga_root.wtg9ga_collapsed:not([role="dialog"]) {
    background: color-mix(in srgb, var(--dsw-specific-sidebar-fill) 24%, transparent);
  }
  html[data-windows-titlebar] .mP3x-q_centerCol:has(.an3WzG_root) {
    background: transparent;
  }
  html[data-windows-titlebar] .an3WzG_root {
    background: color-mix(in srgb, var(--dsw-alias-bg-base) 38%, transparent);
  }
  html[data-windows-titlebar] .mP3x-q_frame[data-sidebar-drawer] .mP3x-q_sidebarCol {
    background: var(--dsw-specific-sidebar-fill);
  }
}

/* Complete the glass treatment on the composer and docked right-hand chrome. */
@media (prefers-reduced-transparency: no-preference) and (forced-colors: none) {
  html[data-windows-titlebar] .GRgSLq_root .GRgSLq_card:not(.GRgSLq_cardWorkspaceTrigger) {
    background: color-mix(in srgb, var(--dsw-specific-input-major) 32%, transparent);
  }
  html[data-windows-titlebar] .mP3x-q_rightbarCol {
    background: transparent;
  }
  html[data-windows-titlebar] .acoR2W_panel ._tabHost_123xe_164:not(._float_123xe_158),
  html[data-windows-titlebar] .acoR2W_panel ._emptyTabHost_123xe_145 {
    background: color-mix(in srgb, var(--dsw-alias-bg-base) 32%, transparent);
  }
  /* Floating and fullscreen panes can cover readable content, so keep a denser frost. */
  html[data-windows-titlebar] .acoR2W_panel ._float_123xe_158,
  html[data-windows-titlebar] .acoR2W_panel[data-sidebar-right-panel="fullscreen"] ._tabHost_123xe_164 {
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 82%, transparent);
    backdrop-filter: blur(20px);
  }
}

/* No opaque floor below the glass composer, or painted backing behind navigation. */
@media (prefers-reduced-transparency: no-preference) and (forced-colors: none) {
  html[data-windows-titlebar] .an3WzG_root .an3WzG_composerSeat,
  html[data-windows-titlebar] .an3WzG_embeddedBody .an3WzG_composerSeat,
  html[data-windows-titlebar] .wtg9ga_root:not(.wtg9ga_collapsed):not([role="dialog"]),
  html[data-windows-titlebar] .wtg9ga_root.wtg9ga_collapsed:not([role="dialog"]),
  html[data-windows-titlebar] .wtg9ga_root .wtg9ga_scrollFade {
    background: transparent;
  }
  html[data-windows-titlebar] .wtg9ga_root:not([role="dialog"]) {
    box-shadow: none;
  }
}

/* Match the quieter native outline scale throughout the shell. */
.wtg9ga_root .wtg9ga_panelRow .wtg9ga_panelGlyph.shell-animated-host .shell-animated-mount svg,
.wtg9ga_root .wtg9ga_newSession .shell-animated-mount svg { width: 17px; height: 17px; stroke-width: 1.55; }
.wtg9ga_root .wtg9ga_newSession { font-weight: 400; }
.wtg9ga_root .wtg9ga_newSessionLabel { font-weight: 400; }
.wtg9ga_root .wtg9ga_newSession .shell-inline-icon-host { width: 18px; height: 18px; }
._1KfHza_actions .shell-animated-mount svg { stroke-width: 1.5; }

._1KfHza_actions[data-clock="end"] .shell-animated-mount svg,
._1KfHza_actions[data-clock="end"] :is(._1KfHza_action,.Hyy-Wa_action) svg { width:11px; height:11px; }

`;
    return {apply(ctx) {
      const id='@local/dsh-shell-theme/sidebar.css';
      document.getElementById(id)?.remove();
      const style=document.createElement('style');
      style.id=id;
      style.textContent=CSS;
      document.head.appendChild(style);
      const disposeIcons=animatedIcons.mountAnimatedIcons();
      const renameNewChat=()=>{
        for(const button of document.querySelectorAll('.wtg9ga_root .wtg9ga_newSession')){
          const label=button.querySelector('.wtg9ga_newSessionLabel');
          if(label&&/new session/i.test(label.textContent||''))label.textContent='New Chat';
          for(const name of ['aria-label','title'])if(/new session/i.test(button.getAttribute(name)||''))button.setAttribute(name,'New Chat');
        }
      };
      renameNewChat();
      const labelObserver=new MutationObserver(renameNewChat);
      labelObserver.observe(document.body,{subtree:true,childList:true});
      // The native hoc slot preserves New chat and owns disposal of our wrapper.
      ctx.inject?.(['slots','sessions','workspaces','uiWorkspace','remoteAccess'],scope=>{
        const sessions=scope.get('sessions'),workspaces=scope.get('workspaces'),navigation=scope.get('uiWorkspace');
        scope.slots.inject('sidebar.session.action',()=>scope.slots.register({name:'sidebar.session.action',id:'shell-pinned-chats',order:100,inject:()=>({
          workspaces:workspaces.list,sessions:sessions.list,
          access:id=>scope.remoteAccess.source('session',id,'workspace/unpinSession'),
          open:id=>{if(!workspaces.list.getSnapshot().archivedSessionIds.includes(id))navigation.openSession(id);},
          unpin:id=>navigation.unpinSession(id)
        })},Pinned));
      });
      ctx.effect(()=>()=>{ labelObserver.disconnect();disposeIcons();style.remove(); });
    }};
  },
});
