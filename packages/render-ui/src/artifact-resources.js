const imageExtension = /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const mediaTypes = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const pathName = path => path.split(/[/\\]/).pop() || path;

export function fileResourceAddress(sessionId, path, cwd) {
  const encode = part => encodeURIComponent(part).replace(/%3A/gi, ':');
  const root = cwd?.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  const scoped = root && normalized.startsWith(root + '/') ? normalized.slice(root.length + 1) : normalized;
  return 'dsh-resource://file/session/' + encode(sessionId) + '/' + scoped.split('/').map(encode).join('/');
}

function messageLinks(text) {
  // Ignore code samples. Match explicit Markdown destinations and bare web URLs.
  const prose = text.replace(/^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]{0,3}\1[^\S\n]*(?=\n|$)|(?![\s\S]))/gm, '')
    .replace(/(`+)[^\n]*?\1/g, '');
  const links = [];
  for (const match of prose.matchAll(/(!?)\[([^\]\n]*)\]\((?:<(https?:\/\/[^\s<>]+)>|(https?:\/\/(?:[^\s<>()]|\([^\s<>()]*\))+))(?:[ \t]+"[^"\n]*")?\)|(?:^|[\s<(])(https?:\/\/[^\s<>"`]+)/gim)) {
    let destination = match[3] ?? match[4] ?? match[5].replace(/[.,;!?\]}]+$/, '');
    if (destination.length > 4096) continue;
    if (match[5]) {
      const extra = destination.split(')').length - destination.split('(').length;
      if (extra > 0) destination = destination.replace(/\)+$/, suffix => suffix.slice(0, Math.max(0, suffix.length - extra)));
    }
    try {
      const url = new URL(destination);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      const image = match[1] === '!' || imageExtension.test(url.pathname);
      links.push({kind: image ? 'images' : 'links', url: url.href,
        title: match[2]?.trim() || (image ? pathName(url.pathname) : url.hostname)});
    } catch {
      // An incomplete or malformed URL has no action.
    }
  }
  return links;
}

function createdPath(event) {
  const {name, arguments: raw} = event.data;
  if (name !== 'write' && name !== 'str_replace_editor') return;
  try {
    const args = JSON.parse(raw);
    if (name === 'write' && typeof args.content === 'string') return args.file_path;
    if (name === 'str_replace_editor' && args.command === 'create' && typeof args.file_text === 'string') return args.path;
  } catch {
    // The recorded arguments are incomplete.
  }
}

export function resourcesFromHistory(sessionId, entries, cwd) {
  const resources = new Map();
  const calls = new Map();
  for (const {event} of entries) {
    if (!Number.isFinite(event?.time) || !event.data) continue;
    const {data} = event;
    const add = (type, key, resource) => {
      const id = JSON.stringify([sessionId, type, key]);
      const previous = resources.get(id);
      if (previous && (previous.savedAt > event.time || (previous.description && !resource.description))) return;
      resources.set(id, {...resource, id, sessionId, savedAt: event.time, fromChat: true});
    };
    const addPath = (path, description) => {
      if (typeof path !== 'string' || !path.trim() || /[\u0000-\u001f\u007f]/.test(path)) return;
      const address = fileResourceAddress(sessionId, path, cwd);
      add('path', address, {kind: imageExtension.test(path) ? 'images' : 'files', address, path,
        title: pathName(path), description: typeof description === 'string' ? description : undefined});
    };
    if (event.type === 'deliverables/presented' && Array.isArray(data.files)) {
      for (const file of data.files) addPath(file?.path, file?.description);
    } else if (event.type === 'tool/call') {
      const path = createdPath(event);
      if (typeof path === 'string') calls.set(data.callId, path);
    } else if (event.type === 'tool/result' && !data.message?.isError && data.error === undefined
      && (event.surfaceOp === undefined || event.surfaceOp === 'append')) {
      const path = calls.get(data.message?.source?.callId);
      if (path) addPath(typeof data.meta?.path === 'string' ? data.meta.path : path);
    }
    const content = event.type === 'user/message' ? data.content
      : event.type === 'assistant/message' ? data.message?.content : undefined;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const attachment = block?.attachment;
      if (block?.type === 'image' && typeof attachment?.attachmentId === 'string' && mediaTypes.has(attachment.mediaType)) {
        const title = typeof attachment.name === 'string' && attachment.name.trim() ? attachment.name : 'Image attachment';
        add('attachment', attachment.attachmentId, {kind:'images', title, attachment});
      } else if (block?.type === 'file' && typeof attachment?.attachmentId === 'string' && typeof attachment.name === 'string') {
        add('attachment', attachment.attachmentId, {kind:'files', title:attachment.name});
      } else if (block?.type === 'text' && typeof block.text === 'string') {
        for (const link of messageLinks(block.text)) add('url', link.url, link);
      }
    }
  }
  return [...resources.values()];
}
