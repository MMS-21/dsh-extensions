// Compatibility entry point for hosts that cached the previous client manifest.
// Power BI is tools-only: do not register tabs, slots, shortcuts or polling.
window.__ModuleLoader__.load({
  id:'@local/dsh-plugin-powerbi-live-designer',
  factory:()=>({apply(){}}),
});
