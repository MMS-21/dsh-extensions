// This function is serialized as the only trusted script in an opaque frame.
// User HTML is rebuilt from an allowlist. User JavaScript runs in a worker,
// which has no DOM and inherits the frame's network policy.
function bootMiniApp() {
  const tags = new Set(('article section main div span h1 h2 h3 h4 p strong em small code pre blockquote ul ol li dl dt dd table caption thead tbody tr th td label input select option output button fieldset legend hr br').split(' '));
  const attributes = new Set(('id class title role for name type value min max step checked selected disabled placeholder data-output aria-label aria-describedby aria-live').split(' '));
  const inputTypes = new Set(['text', 'number', 'range', 'checkbox', 'radio']);
  const validKey = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
  const safeKey = key => validKey.test(key) && !['constructor', 'prototype'].includes(key);
  let initialized = false;
  let stop = () => {};

  function notify(type, detail = {}) {
    parent.postMessage({channel:'dsh-mini-app', type, ...detail}, '*');
  }

  addEventListener('message', event => {
    if (initialized || event.source !== parent || event.data?.channel !== 'dsh-mini-app-init') return;
    initialized = true;
    const {miniApp, data, selection} = event.data;
    const status = document.getElementById('status');
    const main = document.getElementById('app');
    const template = document.createElement('template');
    template.innerHTML = miniApp.html;
    let nodes = 0;
    function copy(node, depth) {
      if (++nodes > 600 || depth > 24) throw new Error('Mini-app layout is too complex.');
      if (node.nodeType === 3) return document.createTextNode(node.textContent);
      if (node.nodeType !== 1 || !tags.has(node.localName)) return null;
      const element = document.createElement(node.localName);
      for (const {name, value} of node.attributes) {
        if (attributes.has(name) && value.length <= 240) element.setAttribute(name, value);
      }
      if (element.localName === 'input' && !inputTypes.has(element.type)) return null;
      if (element.localName === 'button') element.type = 'button';
      for (const child of node.childNodes) {
        const safe = copy(child, depth + 1);
        if (safe) element.append(safe);
      }
      return element;
    }
    try {
      for (const node of template.content.childNodes) {
        const safe = copy(node, 0);
        if (safe) main.append(safe);
      }
    } catch (error) {
      main.replaceChildren();
      status.textContent = error.message;
      return;
    }
    const styles = document.createElement('style');
    styles.textContent = miniApp.css;
    document.head.append(styles);
    const controls = [...main.querySelectorAll('input[name],select[name]')].filter(control => safeKey(control.name)).slice(0, 40);
    const outputs = [...main.querySelectorAll('[data-output]')].filter(node => safeKey(node.dataset.output)).slice(0, 40);
    for (const control of controls) {
      const saved = selection?.['$' + control.name];
      if (saved === undefined) continue;
      if (control.type === 'checkbox') control.checked = saved === true;
      else if (control.type === 'radio') control.checked = control.value === String(saved);
      else control.value = String(saved);
    }
    function calculate() {
      stop();
      const inputs = {};
      for (const control of controls) {
        if (control.type === 'radio' && !control.checked) continue;
        const value = control.type === 'checkbox' ? control.checked
          : ['number', 'range'].includes(control.type) ? control.valueAsNumber : control.value.slice(0, 120);
        if (typeof value !== 'number' || Number.isFinite(value)) inputs[control.name] = value;
      }
      notify('selection', {values:Object.fromEntries(Object.entries(inputs).map(([key, value]) => ['$' + key, value]))});
      const source = miniApp.code + '\n;self.onmessage = async ({data: input}) => { try { self.postMessage({result:await calculate(input.inputs, input.data)}); } catch { self.postMessage({failed:true}); } };';
      const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
      let worker;
      try { worker = new Worker(url); }
      catch {
        URL.revokeObjectURL(url);
        status.textContent = 'The calculation worker could not start.';
        return;
      }
      const timeout = setTimeout(() => {
        stop();
        status.textContent = 'Calculation timed out.';
      }, 1200);
      stop = () => {
        clearTimeout(timeout);
        worker.terminate();
        URL.revokeObjectURL(url);
      };
      worker.onmessage = ({data: message}) => {
        stop();
        const result = message?.result;
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          status.textContent = 'Calculation did not return an output object.';
          return;
        }
        status.textContent = '';
        const values = {};
        for (const output of outputs) {
          const key = output.dataset.output;
          const value = Object.hasOwn(result, key) ? result[key] : undefined;
          if (typeof value === 'string') values[key] = value.slice(0, 1000);
          else if (typeof value === 'boolean' || Number.isFinite(value)) values[key] = value;
          output.textContent = Object.hasOwn(values, key) ? String(values[key]) : '';
        }
        notify('result', {inputs, values});
      };
      worker.onerror = () => { stop(); status.textContent = 'Calculation failed.'; };
      worker.postMessage({inputs, data});
    }
    let queued;
    const queueCalculation = () => {
      clearTimeout(queued);
      queued = setTimeout(calculate, 60);
    };
    main.addEventListener('input', queueCalculation);
    main.addEventListener('change', queueCalculation);
    main.addEventListener('click', event => { if (event.target.closest('button')) queueCalculation(); });
    calculate();
  });
  addEventListener('pagehide', () => stop());
}

export function miniAppDocument(nonce) {
  const csp = "default-src 'none'; script-src 'nonce-" + nonce
    + "'; style-src 'unsafe-inline'; worker-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>:root{color-scheme:light dark;font:15px system-ui}body{margin:0;padding:16px}input,select,button{font:inherit}input[type=range]{max-width:100%}table{border-collapse:collapse}td,th{padding:6px 10px;text-align:start}#status:empty{display:none}</style>
<div id="app"></div><p id="status" role="status"></p><script nonce="${nonce}">(${bootMiniApp.toString()})()</script></html>`;
}
