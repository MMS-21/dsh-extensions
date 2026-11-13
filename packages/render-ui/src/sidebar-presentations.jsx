/**
 * Right-sidebar presentation tab.
 *
 * The inline conversation card stays the primary surface, but a dashboard is
 * also openable in the right-hand panel beside the browser, files and code
 * previews. A presentation is registered under a `dsh-resource://render-ui/…`
 * address; the tab type below claims that pattern, and its body renders the
 * registered spec with the same view components the inline card uses.
 */
import React, {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {OpenUiView} from './openui-view.jsx';
import {DashboardView} from './dashboard-view.jsx';
import {RenderUiIcon} from './sidebar-panel.jsx';
import {artifactId, readArtifact, resolveRevision, saveArtifact, saveRevision} from './artifact-store.js';
import {createSelection} from './data-snapshot.js';

/** Tab-type implementation id, and the key its body/title register under. */
export const TAB_ID = 'render-ui';
/** Type discriminator used by `openTab`/`openResource`. */
export const TAB_KIND = 'renderUi';
/** Locale namespace for the tab chip and guide entry. */
export const TAB_NS = 'render-ui.sidebar';
/** Address prefix every OpenUI presentation is filed under. */
export const ADDRESS_PREFIX = 'dsh-resource://render-ui/';

/** Baseline dictionaries required by the locale service (en and zh). */
export const SIDEBAR_DICTIONARIES = {
  en: {
    title: 'Render UI',
    guideTitle: 'Render UI',
    guideDescription: 'Open an OpenUI presentation from the conversation.',
    open: 'Open in sidebar',
    content: 'Preview content',
    missing: 'This presentation is no longer available.',
  },
  zh: {
    title: '渲染 UI',
    guideTitle: '渲染 UI',
    guideDescription: '打开对话中的 OpenUI 演示。',
    open: '在侧栏中打开',
    content: '预览内容',
    missing: '该演示已不可用。',
  },
};

/** Registered presentations, keyed by their `dsh-resource://` address. */
const presentations = new Map();
const listeners = new Map();

export function presentationAddress(sessionId, callId) {
  return ADDRESS_PREFIX + encodeURIComponent(artifactId(sessionId, callId));
}

function publish(contentId, entry) {
  presentations.set(contentId, entry);
  for (const listener of listeners.get(contentId) ?? []) listener();
}

function subscribe(contentId, listener) {
  const group = listeners.get(contentId) ?? new Set();
  group.add(listener);
  listeners.set(contentId, group);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(contentId);
  };
}

export function updatePresentationDraft(sessionId, callId, spec) {
  const address = presentationAddress(sessionId, callId);
  const existing = presentations.get(address);
  if (existing && existing.status !== 'streaming') return false;
  if (!existing || existing.spec.lang !== spec.lang || existing.title !== spec.title || existing.spec.library !== spec.library) {
    publish(address, {id:artifactId(sessionId, callId), sessionId, spec, title:spec.title, status:'streaming'});
  }
  return !existing;
}

export function failPresentationDraft(sessionId, callId) {
  const address = presentationAddress(sessionId, callId);
  const entry = presentations.get(address);
  if (entry?.status === 'streaming') publish(address, {...entry, status:'failed'});
}

export function hasPresentation(sessionId, callId) {
  return presentations.has(presentationAddress(sessionId, callId));
}

/**
 * File one presentation under an address and return that address.
 * @param spec - validated OpenUI presentation spec.
 * @param title - chip title; defaults to the spec title.
 * @param key - caller-owned identity (a tool call id), so two dashboards with
 *   the same Lang still get their own tab.
 * @returns the `dsh-resource://render-ui/…` address.
 */
export function registerPresentation(spec, title, callId, sessionId, selection) {
  const id = artifactId(sessionId, callId);
  const contentId = presentationAddress(sessionId, callId);
  publish(contentId, {id, sessionId, spec, selection, title: title || spec?.title || 'Interactive view'});
  return contentId;
}

/** Read the presentation filed under an address. */
export function getPresentation(contentId) {
  const draft = presentations.get(contentId);
  if (draft) return draft;
  if (!contentId.startsWith(ADDRESS_PREFIX)) return undefined;
  try { return readArtifact(decodeURIComponent(contentId.slice(ADDRESS_PREFIX.length))); }
  catch { return undefined; }
}

/** Read an optional service seat without letting an absent one throw. */
function optional(ctx, name) {
  try { return ctx[name]; } catch { return undefined; }
}

function SidebarPreviewFrame({title, actions, contentLabel, children}) {
  return <section className="dsh-artifact-frame dsh-sidebar-artifact" aria-label={title}>
    <header className="dsh-artifact-header"><h2>{title}</h2>{actions}</header>
    <div className="dsh-sidebar-artifact-scroll" role="region" aria-label={contentLabel} tabIndex={0}>
      {children}
    </div>
  </section>;
}

/**
 * Register the right-sidebar tab type, its body, and its chip title.
 * @param ctx - plugin context carrying `sidebarRightTabs`, `sidebarRight`, and `slots`.
 * @param runtime - view components and session-scoped bridges.
 */
export function registerSidebarPresentations(ctx, runtime) {
  const tabs = optional(ctx, 'sidebarRightTabs');
  const slots = optional(ctx, 'slots');
  if (!tabs || typeof tabs.register !== 'function') return;
  if (!slots || typeof slots.register !== 'function') return;
  const locale = optional(ctx, 'locale');
  if (locale && typeof locale.register === 'function') {
    try { locale.register(TAB_NS, SIDEBAR_DICTIONARIES); } catch {}
  }

  try {
    tabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      patterns: ['dsh-resource://render-ui/**'],
      title: (address) => getPresentation(address)?.title ?? 'Render UI',
      guide: [{
        id: TAB_ID,
        order: 40,
        title: () => 'Render UI',
        description: () => 'Open an OpenUI presentation from the conversation.',
      }],
    });
  } catch {}

  const body = function SidebarPresentationBody(props) {
    const {useTabInfo, sessionId, t} = props;
    const contentLabel = t ? t('content') : SIDEBAR_DICTIONARIES.en.content;
    const {tab} = useTabInfo();
    const running = props.useSession?.(snapshot => snapshot.running);
    const source = useMemo(() => ({
      subscribe: listener => subscribe(tab.contentId, listener),
      getSnapshot: () => presentations.get(tab.contentId),
    }), [tab.contentId]);
    const live = useSyncExternalStore(source.subscribe, source.getSnapshot);
    const fallback = useMemo(() => getPresentation(tab.contentId), [tab.contentId]);
    const entry = live ?? fallback;
    const proposal = useMemo(() => {
      if (!entry?.spec.revisionOf) return undefined;
      try { return resolveRevision(entry.spec); }
      catch (error) { return {error: error.message}; }
    }, [entry]);
    const selection = useMemo(() => proposal?.spec ? createSelection(proposal.spec, proposal.selection)
      : entry?.sessionId ? entry.selection : entry && createSelection(entry.spec, entry.selection), [entry, proposal]);
    const origin = entry?.sessionId;
    const canUseSession = Boolean(!entry?.status && !proposal && origin && origin === sessionId);
    const actionBridge = useMemo(() => canUseSession ? runtime.createActionBridge(ctx, origin) : undefined, [canUseSession, origin]);
    const toolBridge = useMemo(() => canUseSession ? runtime.createToolBridge(ctx, origin) : undefined, [canUseSession, origin]);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
      setError('');
      try { setSaved(Boolean(proposal?.artifact
        ? proposal.artifact.sourceId === entry.id || proposal.artifact.history?.some(revision => revision.sourceId === entry.id)
        : entry && readArtifact(entry.id))); }
      catch { setSaved(false); }
    }, [entry?.id, proposal]);
    if (entry === undefined) {
      return <div style={{padding: 20, fontSize: 13, opacity: 0.7}}>{t ? t('missing') : 'This presentation is no longer available.'}</div>;
    }
    if (entry.status) {
      const View = entry.spec.library === 'dashboard' ? DashboardView : OpenUiView;
      return <SidebarPreviewFrame title={entry.title} contentLabel={contentLabel}>
        {entry.status === 'failed' || running === false ? <p role="status">This draft did not complete. Check the tool result in chat.</p>
          : <>
            <p role="status">Generating preview…</p>
            {entry.spec.lang && <div ref={node => { if (node) node.inert = true; }}>
              <View spec={entry.spec} isStreaming progressive persistFormState={false} />
            </div>}
          </>}
      </SidebarPreviewFrame>;
    }
    if (proposal?.error) return <p role="alert">{proposal.error}</p>;
    const save = async () => {
      try {
        const candidate = {...entry, selection: selection?.current};
        if (proposal && navigator.locks) {
          await navigator.locks.request('dsh-artifact-revisions', () => saveRevision(candidate));
        } else if (proposal) {
          saveRevision(candidate);
        } else {
          saveArtifact(candidate);
        }
        setSaved(true);
        setError('');
        window.dispatchEvent(new Event('dsh-artifact-saved'));
      }
      catch (error) { setError(proposal ? error.message : 'Could not save this artifact. Check available storage and try again.'); }
    };
    const title = proposal ? proposal.artifact.title + ' · Revision draft' : entry.title;
    const actions = saved ? <span role="status">{proposal ? 'Revision saved' : 'Saved to Artifacts'}</span>
      : <button type="button" className="dsh-artifact-button" onClick={save}>{proposal ? 'Save revision' : 'Save artifact'}</button>;
    return <SidebarPreviewFrame title={title} actions={actions} contentLabel={contentLabel}>
      {error && <p role="alert">{error}</p>}
      <runtime.RenderPresentation key={entry.id} spec={proposal?.spec ?? entry.spec} actionBridge={actionBridge} toolBridge={toolBridge} persistFormState={false} selection={selection} />
    </SidebarPreviewFrame>;
  };

  const title = function SidebarPresentationTitle({useTabInfo}) {
    const {tab} = useTabInfo();
    return <span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}><RenderUiIcon size={14} />{tab.title}</span>;
  };

  try {
    slots.inject('sidebar.right.pane.tab', () => slots.register({
      name: 'sidebar.right.pane.tab', key: TAB_ID, ...(locale ? {locale: TAB_NS} : {}),
    }, body));
  } catch {}
  try {
    slots.inject('sidebar.right.pane.tab.title', () => slots.register({
      name: 'sidebar.right.pane.tab.title', key: TAB_ID, ...(locale ? {locale: TAB_NS} : {}),
    }, title));
  } catch {}
}
