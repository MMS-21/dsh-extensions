import {artifactId} from './artifact-store.js';
import {resourcesFromHistory} from './artifact-resources.js';

export function artifactFromEvent(sessionId, event) {
  const data = event?.data;
  const meta = data?.meta;
  const callId = data?.message?.source?.callId;
  const spec = meta?.spec;
  if (event?.type !== 'tool/result' || !data || data.message?.isError || data.error !== undefined
    || meta?.tool !== 'render_ui' || meta.version !== 1 || typeof callId !== 'string'
    || !Number.isFinite(event.time)
    || !(spec?.view === 'openui' && typeof spec.lang === 'string'
      || spec?.view === 'mini-app' && typeof spec.miniApp?.code === 'string')) return;
  return {
    id: artifactId(sessionId, callId), spec, savedAt: event.time,
    title: typeof spec.title === 'string' && spec.title.trim() ? spec.title : 'Interactive view',
    fromChat: true,
  };
}

export async function discoverChatArtifacts(sessions, signal, publish) {
  if (!sessions) return;
  await sessions.refresh();
  const {ids, byId} = sessions.list.getSnapshot();
  // Use bounded batches so opening the library does not retain every chat at once.
  const recent = ids.filter(id => !byId[id]?.blank)
    .sort((a, b) => byId[b].updatedAt - byId[a].updatedAt).slice(0, 30);
  let failures = 0;
  for (let offset = 0; offset < recent.length && !signal.aborted; offset += 3) {
    const batch = await Promise.allSettled(recent.slice(offset, offset + 3).map(async id => {
      const reference = sessions.retain(id, {source: 'controllerOperation', signal});
      try {
        const {session, eventSource} = await reference.ready;
        if (signal.aborted) return;
        const opening = session.getSnapshot();
        if (opening.openState !== 'open') throw new Error('Chat history unavailable');
        const collect = () => {
          if (signal.aborted) return;
          const {entries} = eventSource.getSnapshot();
          const found = entries.map(({event}) => artifactFromEvent(id, event)).filter(Boolean);
          found.push(...resourcesFromHistory(id, entries, byId[id]?.cwd));
          if (found.length) publish(found);
        };
        collect();
        for (let page = 0; page < 2 && !signal.aborted && session.getSnapshot().hasMore; page++) {
          await session.loadOlder();
          collect();
        }
      } finally {
        reference.release();
      }
    }));
    failures += batch.filter(result => result.status === 'rejected').length;
  }
  if (!signal.aborted && failures) throw new Error('Some chat history was unavailable');
}
