import React, {useEffect, useMemo, useRef, useState} from 'react';
import {miniAppDocument} from './mini-app-frame.js';

export function MiniAppView({spec, selection}) {
  const frame = useRef(null);
  const [result, setResult] = useState(null);
  const document = useMemo(() => {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    return miniAppDocument(nonce);
  }, []);
  useEffect(() => {
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.origin !== 'null'
        || event.data?.channel !== 'dsh-mini-app') return;
      if (event.data.type === 'selection') {
        selection?.update?.(event.data.values);
        setResult(null);
      } else if (event.data.type === 'result') {
        setResult({inputs:event.data.inputs, outputs:event.data.values});
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [selection]);
  const initialize = () => frame.current?.contentWindow?.postMessage({
    channel:'dsh-mini-app-init', miniApp:spec.miniApp, data:spec.snapshot?.data ?? {}, selection:selection?.current,
  }, '*');
  const download = () => {
    const data = {title:spec.title, dataSnapshot:spec.snapshot ?? null, ...result};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'mini-app-results.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div>
    <iframe ref={frame} onLoad={initialize} srcDoc={document} sandbox="allow-scripts"
      title={spec.title || 'Interactive tool'} className="dsh-mini-app-frame" />
    <button type="button" className="dsh-artifact-button" disabled={!result} onClick={download}>Download results</button>
  </div>;
}
