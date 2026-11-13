import React, {useEffect, useMemo, useState} from 'react';
import {OpenUiView} from './openui-view.jsx';
import {DashboardView} from './dashboard-view.jsx';
import {MiniAppView} from './mini-app-view.jsx';
import {artifactVersion, listArtifacts, makeRevisionPrompt, resolveRevision, saveArtifact, saveRevision} from './artifact-store.js';
import {discoverChatArtifacts} from './artifact-history.js';
import {ArtifactResourcePreview} from './artifact-resource-preview.jsx';
import {createSelection} from './data-snapshot.js';
import {customExamples} from './openui-examples.js';

/** Sidebar entry id and main-panel key. The sidebar selects the matching `main` key. */
export const PANEL_ID = 'render-ui';
/** Locale namespace owned by this panel. */
export const PANEL_NS = 'render-ui.panel';

/** Baseline dictionaries required by the locale service (en and zh), plus the panel copy. */
export const PANEL_DICTIONARIES = {
  en: {
    panel: 'Artifacts',
    title: 'Artifacts',
    tagline: 'Browse views, files, links, and images from recent chats, alongside saved artifacts.',
    emptyTitle: 'No artifacts found',
    empty: 'When a chart, dashboard, or mini-app is worth keeping, open it beside the chat and choose Save artifact.',
    example: 'Try an interactive example',
    loadError: 'Could not read your saved artifacts.',
    back: 'Close preview',
    search: 'Search artifacts',
    noMatches: 'No artifacts match your search and filters.',
    reset: 'Clear search and filters',
    loading: 'Loading saved artifacts…',
    choose: 'Select an artifact to preview it here.',
    all: 'All',
    dashboard: 'Dashboard',
    interactive: 'Interactive view',
    miniApp: 'Mini-app',
    version: 'Version',
    unnamedChat: 'Source chat unavailable',
    fromChat: 'From chat',
    scanning: 'Looking for artifacts in recent chats…',
    scanError: 'Some recent chats could not be read.',
    save: 'Save artifact',
    saveError: 'Could not save this artifact.',
    files: 'Files',
    links: 'Links',
    images: 'Images',
    openFile: 'Open in file preview',
    openLink: 'Open in browser',
    openChat: 'Open source chat',
    fileUnavailable: 'Could not open this file.',
    imageUnavailable: 'Could not load this image.',
    loadingImage: 'Loading image…',
  },
  zh: {
    panel: '工件',
    title: '工件',
    tagline: '浏览近期对话中的视图、文件、链接、图片和已保存的工件。',
    emptyTitle: '未找到工件',
    empty: '想保留图表、仪表板或小应用时，在对话侧栏打开它，然后选择保存工件。',
    example: '试用交互示例',
    loadError: '无法读取已保存的工件。',
    back: '关闭预览',
    search: '搜索工件',
    noMatches: '没有符合搜索和筛选条件的工件。',
    reset: '清除搜索和筛选条件',
    loading: '正在加载已保存的工件…',
    choose: '选择一个工件以在此预览。',
    all: '全部',
    dashboard: '仪表板',
    interactive: '交互视图',
    miniApp: '小应用',
    version: '版本',
    unnamedChat: '找不到来源对话',
    fromChat: '来自对话',
    scanning: '正在查找近期对话中的工件…',
    scanError: '无法读取部分近期对话。',
    save: '保存工件',
    saveError: '无法保存此工件。',
    files: '文件',
    links: '链接',
    images: '图片',
    openFile: '打开文件预览',
    openLink: '在浏览器中打开',
    openChat: '打开来源对话',
    fileUnavailable: '无法打开此文件。',
    imageUnavailable: '无法加载此图片。',
    loadingImage: '正在加载图片…',
  },
};

/** Sidebar glyph. The sidebar passes the requested edge and the selected state. */
export function RenderUiIcon({size = 18}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{display: 'block'}}
    >
      <rect x="7" y="9" width="50" height="46" rx="9" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <rect x="16" y="18" width="15" height="9" rx="2.5" fill="currentColor" />
      <rect x="16" y="33" width="32" height="6" rx="3" fill="currentColor" opacity="0.72" />
      <rect x="16" y="44" width="22" height="6" rx="3" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

/**
 * Root-scoped central panel opened by the sidebar entry. It previews the same
 * OpenUI renderer the `render_ui` tool uses; no Session is bound to this panel.
 */
function artifactKind(spec) {
  if (spec.view === 'mini-app') return 'miniApp';
  return spec.library === 'dashboard' ? 'dashboard' : 'interactive';
}

function sourceChat(id, titleFor) {
  try { return titleFor?.(JSON.parse(id)[0]); }
  catch { return undefined; }
}

const dateFormat = new Intl.DateTimeFormat(undefined, {month:'short', day:'numeric', year:'numeric'});
const filters = ['all', 'images', 'files', 'links', 'interactive', 'dashboard', 'miniApp'];

export function RenderUiPanel({t, sessions, sessionTitleFor, openFile, openChat, workspaceFiles}) {
  const translate = typeof t === 'function' ? t : key => PANEL_DICTIONARIES.en[key];
  const label = (key) => translate(key);
  const [artifacts, setArtifacts] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [version, setVersion] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [showExample, setShowExample] = useState(false);
  const [fromChats, setFromChats] = useState(() => new Map());
  const [scanning, setScanning] = useState(Boolean(sessions));
  const [scanError, setScanError] = useState(false);
  const [saveError, setSaveError] = useState(null);
  useEffect(() => {
    const refresh = () => {
      try { setArtifacts(listArtifacts()); setLoadError(false); }
      catch { setLoadError(true); }
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('dsh-artifact-saved', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('dsh-artifact-saved', refresh);
    };
  }, []);
  useEffect(() => {
    if (!sessions) return;
    const controller = new AbortController();
    setFromChats(new Map());
    setScanning(true);
    setScanError(false);
    discoverChatArtifacts(sessions, controller.signal, found => {
      setFromChats(previous => new Map([...previous, ...found.map(item => [item.id, item])]));
    }).catch(() => {
      if (!controller.signal.aborted) setScanError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setScanning(false);
    });
    return () => controller.abort();
  }, [sessions]);
  const merged = new Map(fromChats);
  for (const saved of artifacts ?? []) {
    merged.set(saved.id, saved);
    for (const revision of [...(saved.history ?? []), saved]) {
      if (revision.sourceId) merged.delete(revision.sourceId);
    }
  }
  const current = merged.get(selectedId);
  const artifact = current?.spec ? current : undefined;
  const latest = artifact?.version ?? 1;
  const selected = artifact && artifactVersion(artifact, version ?? latest);
  const preview = useMemo(() => {
    if (!selected?.spec.revisionOf) return selected;
    try { return {...selected, ...resolveRevision(selected.spec)}; }
    catch (error) { return {error: error.message}; }
  }, [selected, artifacts]);
  const SelectedView = preview?.spec?.view === 'mini-app' ? MiniAppView
    : preview?.spec?.library === 'dashboard' ? DashboardView : OpenUiView;
  const selection = useMemo(() => preview?.spec && createSelection(preview.spec, preview.selection), [preview]);
  const entries = [...merged.values()].sort((a, b) => b.savedAt - a.savedAt).map(artifact => ({
    artifact, kind:artifact.kind ?? artifactKind(artifact.spec),
    chat:sourceChat(artifact.id, sessionTitleFor ?? (id => sessions?.list.getSnapshot().byId[id]?.displayTitle)),
  }));
  const saveSelected = async () => {
    setSaveError(null);
    try {
      const candidate = {...artifact, selection: selection?.current};
      const saved = !artifact.spec.revisionOf ? saveArtifact(candidate)
        : navigator.locks ? await navigator.locks.request('dsh-artifact-revisions', () => saveRevision(candidate))
        : saveRevision(candidate);
      setSelectedId(saved.id);
      setVersion(null);
      window.dispatchEvent(new Event('dsh-artifact-saved'));
    } catch {
      setSaveError(selectedId);
    }
  };
  const query = search.trim().toLocaleLowerCase();
  const visible = entries.filter(entry => (kind === 'all' || entry.kind === kind)
    && [entry.artifact.title, entry.artifact.path, entry.artifact.url, entry.artifact.description, entry.chat, label(entry.kind)]
      .some(value => value?.toLocaleLowerCase().includes(query)));
  return (
    <main className="dsh-artifact-library">
      <header style={{display: 'grid', gap: 8}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
          <span style={{display: 'inline-flex', color: 'var(--dsw-alias-brand-primary, #247bbf)'}}>
            <RenderUiIcon size={26} />
          </span>
          <h1 style={{margin: 0, fontSize: 22, fontWeight: 650, letterSpacing: '-0.01em'}}>
            {label('title')}
          </h1>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--dsw-alias-label-secondary, inherit)',
            maxWidth: '72ch',
          }}
        >
          {label('tagline')}
        </p>
      </header>
      {entries.length > 0 && <div className="dsh-library-toolbar">
        <input type="search" aria-label={label('search')} placeholder={label('search')}
          value={search} onChange={event => setSearch(event.target.value)} />
        <div className="dsh-library-filters" role="group" aria-label={label('title')}>
          {filters.map(filter => <button key={filter} type="button" className="dsh-library-filter"
            aria-pressed={kind === filter} onClick={() => {setKind(filter); setSelectedId(null);}}>
            {label(filter)} <span>{filter === 'all' ? entries.length : entries.filter(entry => entry.kind === filter).length}</span>
          </button>)}
        </div>
      </div>}
      {scanning && <p role="status">{label('scanning')}</p>}
      {scanError && <p role="status">{label('scanError')}</p>}
      {loadError && <p role="alert">{label('loadError')}</p>}
      {artifacts && !loadError && !scanning && entries.length === 0
        ? <section className="dsh-library-empty">
          <h2>{label('emptyTitle')}</h2>
          <p>{label('empty')}</p>
          <details onToggle={event => setShowExample(event.currentTarget.open)}>
            <summary>{label('example')}</summary>
            {showExample && <OpenUiView spec={{view:'openui', lang:customExamples[0]}} persistFormState={false} />}
          </details>
        </section>
        : <div className="dsh-library-workspace" data-preview={Boolean(entries.length)}>
        <div className="dsh-library-results">
          {!artifacts && !loadError && !entries.length ? <p role="status">{label('loading')}</p>
            : !visible.length && entries.length > 0 ? <div><p role="status">{label('noMatches')}</p>
              <button className="dsh-artifact-button" type="button" onClick={() => {setSearch(''); setKind('all');}}>{label('reset')}</button>
            </div>
            : <ul className="dsh-artifact-list">
              {visible.map(({artifact: item, kind: type, chat}) => <li key={item.id}>
                <button type="button" className="dsh-library-row" aria-pressed={item.id === selectedId}
                  onClick={() => {setSelectedId(item.id); setVersion(null);}}>
                  <span className="dsh-library-row-title">{item.title}</span>
                  {(item.path || item.url) && <span className="dsh-library-row-location" title={item.path || item.url}>{item.path || item.url}</span>}
                  <span className="dsh-library-row-meta">
                    <span>{label(type)} · {item.fromChat ? label('fromChat') : `${label('version')} ${item.version ?? 1}`}</span>
                    <time>{dateFormat.format(item.savedAt)}</time>
                  </span>
                  <span className="dsh-library-row-chat">{chat || label('unnamedChat')}</span>
                </button>
              </li>)}
            </ul>}
        </div>
      {current?.kind ? <ArtifactResourcePreview key={current.id} item={current} sessions={sessions} workspaceFiles={workspaceFiles}
        openFile={openFile} openChat={openChat} label={label} onClose={() => setSelectedId(null)} />
      : selected ? <section aria-label={selected.title} className="dsh-artifact-frame dsh-library-preview">
        <header className="dsh-artifact-header">
          <h2>{selected.title}</h2>
          <button type="button" className="dsh-artifact-button" onClick={() => setSelectedId(null)}>{label('back')}</button>
        </header>
        {artifact.fromChat ? <div className="dsh-artifact-header">
          <button type="button" className="dsh-artifact-button" onClick={saveSelected} disabled={Boolean(preview?.error)}>{label('save')}</button>
          {saveError === selectedId && <span role="alert">{label('saveError')}</span>}
        </div> : <div className="dsh-artifact-header">
          <label>Version{' '}
            <select value={version ?? latest} onChange={event => setVersion(Number(event.target.value) === latest ? null : Number(event.target.value))}>
              <option value={latest}>Version {latest} · Latest</option>
              {[...(artifact.history ?? [])].reverse().map(revision => <option key={revision.version} value={revision.version}>Version {revision.version}</option>)}
            </select>
          </label>
          {(version ?? latest) === latest && <details>
            <summary>Revise in chat</summary>
            <p>Copy this prompt into a chat and describe the change you want.</p>
            <textarea aria-label="Revision prompt" rows={5} readOnly value={makeRevisionPrompt(artifact)} onFocus={event => event.target.select()} />
          </details>}
        </div>}
        {preview?.error ? <p role="alert">{preview.error}</p>
          : <SelectedView key={selected.id + ':' + (selected.version ?? 1)} spec={preview.spec} persistFormState={false} selection={selection} />}
      </section> : entries.length > 0 && <aside className="dsh-library-preview dsh-library-placeholder"><p>{label('choose')}</p></aside>}
      </div>}
    </main>
  );
}
