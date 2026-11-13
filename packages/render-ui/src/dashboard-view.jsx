import React, {useEffect, useId, useMemo, useRef, useState} from 'react';
import {Renderer} from '@openuidev/react-lang';
import {ThemeProvider, library} from '@openuidev/dashboard-library';
import {Skeleton, SkeletonBox, SkulletProvider} from 'skullet/react';
import {actionRequest} from './action-bridge.js';
import {useShellTheme} from './use-shell-theme.js';
import {SNAPSHOT_QUERY, readSnapshot} from './data-snapshot.js';
import {hashSpec, loadFormState as readFormState, saveFormState as writeFormState} from './form-state.js';

/**
 * Dashboard renderer for the `library: "dashboard"` dialect.
 *
 * Uses `@openuidev/dashboard-library`'s own ThemeProvider, which scopes its
 * tokens to `.openui-dashboard-theme`. The layout grammar is
 * `Dashboard([DashboardHeader, Section])` with `CardRow` + cards inside.
 */
export function DashboardView({spec, actionBridge, toolBridge, isStreaming=false, progressive=false, observability=false, persistFormState=!spec.snapshot, selection}) {
  const id = 'dsh-openui-' + useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const [errors,setErrors] = useState([]);
  const [parseResult,setParseResult] = useState(null);
  const [errorLog,setErrorLog] = useState([]);
  const [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false);
  const storageKey = useMemo(() => hashSpec(spec?.lang), [spec?.lang]);
  const [formState,setFormState] = useState(() => selection?.current ?? (persistFormState && !isStreaming ? readFormState(storageKey) : undefined));
  const mode = useShellTheme();
  const execution = useRef(null);
  useEffect(() => () => {execution.current?.abort();execution.current=null;}, [toolBridge, isStreaming]);
  useEffect(() => { setFormState(selection?.current ?? (persistFormState && !isStreaming ? readFormState(storageKey) : undefined)); }, [storageKey, persistFormState, isStreaming, selection]);
  const provider = useMemo(() => new Proxy(Object.create(null), {get(_target, key) {
    if (key === 'then' || key === 'callTool' || typeof key !== 'string') return undefined;
    return async args => {
      if (isStreaming) throw new Error('Tool execution is disabled in streaming previews.');
      if (key === SNAPSHOT_QUERY) return readSnapshot(spec, args);
      if (!toolBridge) throw new Error('Session tool execution is unavailable.');
      execution.current ??= new AbortController();
      return toolBridge(key, args, execution.current.signal);
    };
  }}), [toolBridge, isStreaming, spec.snapshot]);
  const draftFollowup = async text => {
    if (!actionBridge) {setStatus('Open the source chat to use this follow-up.');return;}
    try {await actionBridge(text);setStatus('');}
    catch(error) {setStatus(error.message);}
  };
  const onAction = event => {
    if(isStreaming){setStatus('Actions are disabled until the final presentation is validated.');return;}
    if (event && (event.type === 'open_url' || event.type === 'OpenUrl' || event.type === 'openUrl')) {
      const url = event.params?.url ?? event.params?.href ?? event.humanFriendlyMessage;
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) { try { window.open(url, '_blank', 'noopener,noreferrer'); setStatus('Opened link.'); } catch (e) { setStatus(String(e?.message || e)); } return; }
    }
    try { void draftFollowup(actionRequest(event)); }
    catch(error) {setStatus(error.message);}
  };
  const handleStateUpdate = (state) => {
    setFormState(state);
    selection?.update?.(state);
    if (persistFormState && !isStreaming) writeFormState(storageKey, state);
  };
  const handleError = (errs) => {
    setErrors(errs || []);
    if (Array.isArray(errs)) {
      setErrorLog(prev => {
        const next = [...prev];
        for (const e of errs) {
          const msg = (e && (e.message || e.code)) ? String(e.message || e.code) : String(e);
          if (!next.includes(msg)) next.push(msg);
        }
        return next.slice(-50);
      });
    }
  };
  const requestRepair = async () => {
    if (!actionBridge) {setStatus('Session actions unavailable; copy the request into the chat.');return;}
    const errs = [...new Set([...errors.map(e=>e.message || e.code || String(e)), ...errorLog])].slice(0,20).join('\n');
    const prompt = 'The OpenUI dashboard presentation above failed to render cleanly. Please repair the OpenUI Lang so it validates against the dashboard component library, preserving intent. Errors:\n' + (errs || '(none reported)') + '\nCurrent spec hash: ' + storageKey;
    setBusy(true);
    try { await actionBridge(prompt); setStatus(''); } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  };
  return <section id={id} className="dsh-openui-surface" style={{minWidth:0, maxWidth:'100%', padding:16, overflowWrap:'anywhere', color: mode==='dark' ? '#f1f5f9' : '#1e293b'}}>
    <SkulletProvider mode={mode === 'dark' ? 'dark' : 'light'}>
      <Skeleton loading={isStreaming && !progressive} id={id + '-sk'} label="Loading dashboard">
        <ThemeProvider mode={mode}>
          <Renderer response={spec.lang} library={library} isStreaming={isStreaming} publishObservability={observability} toolProvider={provider} onAction={onAction} onError={handleError} onStateUpdate={handleStateUpdate} initialState={formState} onParseResult={setParseResult} queryLoader={<SkeletonBox height={16} width={16} radius={8} />} />
      {!isStreaming && (errors.length > 0 || errorLog.length > 0) && <details><summary>UI diagnostics ({errors.length} errors, {errorLog.length} logged)</summary><pre style={{whiteSpace:'pre-wrap'}}>{[...new Set([...errors.map(e=>e.message || e.code || String(e)), ...errorLog])].slice(0,20).join('\n')}</pre>{parseResult && <pre style={{whiteSpace:'pre-wrap',opacity:.7}}>{JSON.stringify(parseResult,null,2).slice(0,2000)}</pre>}<div style={{marginTop:8}}><button type="button" disabled={busy || !actionBridge} onClick={requestRepair} style={{color: mode==='dark' ? '#f8fafc' : '#1e293b', background: mode==='dark' ? '#334155' : '#e2e8f0', border:'1px solid currentColor', borderRadius:6, padding:'4px 12px', cursor:'pointer'}}>Request repair from agent</button></div></details>}
      {status && <p role="status">{status}</p>}
      {isStreaming && <small style={{display:'block',opacity:.65,marginTop:12}}>Unvalidated streaming preview — actions disabled</small>}
        </ThemeProvider>
      </Skeleton>
    </SkulletProvider>
  </section>;
}
