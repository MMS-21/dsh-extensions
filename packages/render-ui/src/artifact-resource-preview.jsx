import React, {useEffect, useState} from 'react';

const imageTypes = {
  apng:'image/apng', avif:'image/avif', bmp:'image/bmp', gif:'image/gif', ico:'image/x-icon',
  jpeg:'image/jpeg', jpg:'image/jpeg', png:'image/png', svg:'image/svg+xml', webp:'image/webp',
};

function ResourceImage({item, sessions, workspaceFiles, label}) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    let url;
    const load = async () => {
      let response;
      let type;
      if (item.attachment) {
        response = await sessions.using(item.sessionId, {source:'controllerOperation', signal:controller.signal},
          reference => reference.binding.session.readAttachment(item.attachment.attachmentId));
        type = response.value?.attachment.mediaType;
      } else {
        response = await workspaceFiles.readBytes(item.sessionId, item.path, {}, controller.signal);
        type = imageTypes[item.path.split('.').pop().toLowerCase()];
      }
      if (controller.signal.aborted) return;
      if (!response.ok || !type) throw new Error('Image unavailable');
      url = URL.createObjectURL(new Blob([response.value.data], {type}));
      setResult(url);
    };
    load().catch(() => { if (!controller.signal.aborted) setResult(false); });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [item, sessions, workspaceFiles]);
  if (result === false) return <p role="status">{label('imageUnavailable')}</p>;
  if (!result) return <p role="status">{label('loadingImage')}</p>;
  return <img className="dsh-library-image" src={result} alt={item.title} onError={() => setResult(false)} />;
}

export function ArtifactResourcePreview({item, sessions, workspaceFiles, openFile, openChat, label, onClose}) {
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = item.kind === 'images' && (item.attachment && sessions || item.address && workspaceFiles);
  const previewFile = async () => {
    setFailed(false);
    setOpening(true);
    try { await openFile(item); }
    catch { setFailed(true); }
    finally { setOpening(false); }
  };
  return <section aria-label={item.title} className="dsh-artifact-frame dsh-library-preview">
    <header className="dsh-artifact-header">
      <h2>{item.title}</h2>
      <button type="button" className="dsh-artifact-button" onClick={onClose}>{label('back')}</button>
    </header>
    {item.description && <p>{item.description}</p>}
    {(item.path || item.url) && <p className="dsh-library-location">{item.path || item.url}</p>}
    {showImage && <ResourceImage item={item} sessions={sessions} workspaceFiles={workspaceFiles} label={label} />}
    <div className="dsh-artifact-actions">
      {item.url && <a className="dsh-artifact-button" href={item.url} target="_blank" rel="noopener noreferrer">{label('openLink')}</a>}
      {item.address && openFile && <button type="button" className="dsh-artifact-button" disabled={opening} onClick={previewFile}>{label('openFile')}</button>}
      {openChat && <button type="button" className="dsh-artifact-button" onClick={() => openChat(item.sessionId)}>{label('openChat')}</button>}
    </div>
    {failed && <p role="alert">{label('fileUnavailable')}</p>}
  </section>;
}
