/** Read model identity from the native DSH catalog and session projection. */
export function chatModelState(catalog, list, sessionId) {
  const sessions = (list?.ids || []).map(id => list.byId[id])
    .filter(row => row && row.origin !== 'subagent' && !row.parentId);
  const row = sessions.find(row => row.id === sessionId);
  const projection = row?.projectionValues?.modelSelection;
  return {
    sessions,
    sessionId: row?.id ?? (list?.phase === 'ready' ? null : sessionId || null),
    current: row ? (projection ? projection.next ?? catalog?.default ?? null : null)
      : sessionId && list?.phase !== 'ready' ? null : catalog?.default ?? null,
    lastUsed: projection?.lastUsed ?? null,
    defaultSelection: catalog?.default ?? null,
  };
}

export function modelCaption(catalog, selection) {
  if (!selection) return 'Not available yet';
  const provider = catalog?.groups?.find(group => group.id === selection.provider);
  const model = provider?.models?.find(model => model.id === selection.model);
  const effort = selection.reasoningEffort ?? model?.reasoning?.defaultEffort;
  return `${model?.name || selection.model} · ${provider?.name || selection.provider}${effort ? ` · ${effort}` : ''}`;
}
