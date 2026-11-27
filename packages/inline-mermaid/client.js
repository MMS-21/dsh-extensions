const blockSelector = '.md-code-block, pre';
const languagePattern = /^(?:mermaid|mmd)(?:\s|$)/i;
const plainLanguage = /^(?:code block|plain text|plaintext|text)?$/i;
const diagramStart = /^(?:(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b|(?:sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey-beta|xychart-beta|block-beta|architecture-beta|packet-beta|kanban|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment))\b)/;
const styleText = `
  [data-dsh-mermaid-hidden] { display: none !important; }
  .dsh-inline-mermaid { margin: 0; padding: .25rem .5rem .5rem; color: inherit; }
  .dsh-inline-mermaid-controls { display: flex; justify-content: flex-end; }
  .dsh-inline-mermaid button { font: inherit; font-size: .8rem; color: inherit; background: transparent;
    border: 0; border-radius: .375rem; padding: .25rem .55rem; min-height: 30px; cursor: pointer; }
  .dsh-inline-mermaid button:hover { background: #262835; }
  .dsh-inline-mermaid :focus-visible { outline: 2px solid #9faeea; outline-offset: -2px; }
  .dsh-inline-mermaid button.dsh-inline-mermaid-more { display: grid; place-items: center; width: 30px; height: 30px;
    border-radius: 50%; background: color-mix(in srgb, currentColor 9%, transparent); font-size: 1rem; line-height: 1; }
  .dsh-inline-mermaid-menu { position: fixed; inset: auto; margin: 0; padding: .25rem; min-width: 10rem;
    max-width: calc(100vw - 1rem); border: 1px solid #3b3d49; border-radius: .7rem; color: #ececf3;
    background: #24252d; box-shadow: 0 6px 20px rgb(0 0 0 / 30%); }
  .dsh-inline-mermaid-menu button { display: block; width: 100%; text-align: left; }
  .dsh-inline-mermaid-canvas { overflow-x: auto; }
  .dsh-inline-mermaid img { display: block; width: 100%; height: auto; max-height: 32rem; object-fit: contain;
    margin: .45rem auto; }
  .dsh-inline-mermaid-canvas img { min-width: var(--dsh-mermaid-min-width, 0px); }
  .dsh-inline-mermaid [hidden] { display: none; }
  .dsh-inline-mermaid dialog { box-sizing: border-box; width: min(1100px, calc(100vw - 2rem)); max-height: 90vh;
    padding: 1rem; color: #e1e4f3; background: #131316; border: 1px solid #484e6a; border-radius: .65rem; }
  .dsh-inline-mermaid dialog::backdrop { background: rgb(0 0 0 / 70%); }
  .dsh-inline-mermaid dialog img { max-height: 72vh; }
`;

function readBlock(block) {
  const pre = block.matches('pre') ? block : block.querySelector('pre') ?? block.querySelector('code');
  if (!pre) return;
  const code = pre.querySelector('code') ?? pre;
  const banner = block.querySelector('.infostring');
  const languageClass = [...code.classList, ...pre.classList].find(value => value.startsWith('language-'));
  const language = code.dataset.language || pre.dataset.language || languageClass?.slice(9)
    || banner?.textContent.trim() || '';
  const source = code.textContent;
  const firstLine = source.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('%%'));
  if (!(languagePattern.test(language) || (plainLanguage.test(language) && diagramStart.test(firstLine ?? '')))) return;
  return {pre, source};
}

function closestBlock(element) {
  return element?.closest('.md-code-block') ?? element?.closest('pre');
}

function createRenderer() {
  let frame;
  let ready = false;
  let nextId = 0;
  const requests = new Map();

  function receive(event) {
    if (event.source !== frame?.contentWindow) return;
    if (event.data?.type === 'dsh-mermaid-ready') {
      ready = true;
      for (const request of requests.values()) send(request);
    } else if (event.data?.type === 'dsh-mermaid-result') {
      requests.get(event.data.id)?.settle(event.data);
    }
  }

  function send({id, source}) {
    frame.contentWindow.postMessage({type:'dsh-mermaid-render', id, source}, '*');
  }

  function render(source) {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.title = 'Mermaid renderer';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:600px;border:0;pointer-events:none';
      frame.srcdoc = '<!doctype html><meta charset="utf-8">'
        + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:">'
        + '<script>' + __MERMAID_FRAME_SCRIPT__.replace(/<\/script/gi, '<\\/script') + '</script>';
      window.addEventListener('message', receive);
      document.body.append(frame);
    }
    const id = ++nextId;
    return new Promise(resolve => {
      const settle = diagram => {
        clearTimeout(timer);
        requests.delete(id);
        resolve(typeof diagram?.svg === 'string' && diagram.svg.length <= 2_000_000 ? diagram : undefined);
      };
      const timer = setTimeout(settle, 12000);
      const request = {id, source, settle};
      requests.set(id, request);
      if (ready) send(request);
    });
  }

  return {render, dispose() {
    window.removeEventListener('message', receive);
    for (const request of requests.values()) request.settle();
    frame?.remove();
  }};
}

function mountDiagram(block, source, {svg, width}) {
  const figure = document.createElement('figure');
  figure.className = 'dsh-inline-mermaid';
  const controls = document.createElement('div');
  controls.className = 'dsh-inline-mermaid-controls';
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'dsh-inline-mermaid-more';
  more.setAttribute('aria-label', 'Diagram actions');
  more.textContent = '⋯';
  const menu = document.createElement('div');
  menu.className = 'dsh-inline-mermaid-menu';
  menu.setAttribute('popover', 'auto');
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Diagram actions');
  more.popoverTargetElement = menu;
  menu.addEventListener('toggle', event => {
    if (event.newState !== 'open') return;
    const anchor = more.getBoundingClientRect();
    const {width, height} = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, anchor.right - width)}px`;
    menu.style.top = `${anchor.bottom + height + 8 <= window.innerHeight
      ? anchor.bottom + 4 : Math.max(8, anchor.top - height - 4)}px`;
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy as code';
  const download = document.createElement('button');
  download.type = 'button';
  download.textContent = 'Download image';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Show Mermaid source';
  const image = document.createElement('img');
  image.alt = 'Mermaid diagram. Show Mermaid source for the text definition.';
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const canvas = document.createElement('div');
  canvas.className = 'dsh-inline-mermaid-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'region');
  canvas.setAttribute('aria-label', 'Inline Mermaid diagram');
  if (Number.isFinite(width) && width > 0) {
    canvas.style.setProperty('--dsh-mermaid-min-width', `${Math.min(1600, Math.round(width * .85))}px`);
  }
  canvas.append(image);
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.textContent = 'Expand diagram';
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'Expanded Mermaid diagram');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close diagram';
  const expandedImage = image.cloneNode();
  expandedImage.alt = 'Expanded Mermaid diagram';
  dialog.append(close, expandedImage);
  expand.addEventListener('click', () => { menu.hidePopover(); dialog.showModal(); });
  close.addEventListener('click', () => dialog.close());
  let showSource = false;
  const update = () => {
    block.toggleAttribute('data-dsh-mermaid-hidden', !showSource);
    canvas.hidden = showSource;
    expand.hidden = showSource;
    toggle.textContent = showSource ? 'Show diagram' : 'Show Mermaid source';
  };
  toggle.addEventListener('click', () => { menu.hidePopover(); showSource = !showSource; update(); more.focus(); });
  copy.addEventListener('click', async () => {
    menu.hidePopover();
    try {
      await navigator.clipboard.writeText(source);
      status.textContent = 'Code copied';
    } catch {
      showSource = true;
      update();
      status.textContent = 'Clipboard unavailable. Select the source to copy it.';
    }
    more.focus();
  });
  download.addEventListener('click', () => {
    menu.hidePopover();
    const link = document.createElement('a');
    link.href = image.src;
    link.download = 'mermaid-diagram.svg';
    link.click();
    more.focus();
  });
  dialog.addEventListener('close', () => more.focus());
  image.addEventListener('error', () => {
    showSource = true;
    update();
    toggle.disabled = true;
    toggle.textContent = 'Diagram unavailable';
    download.disabled = true;
  }, {once:true});
  menu.append(copy, download, toggle, expand);
  controls.append(more, menu);
  figure.append(controls, status, canvas, dialog);
  block.after(figure);
  update();
  return () => {
    block.removeAttribute('data-dsh-mermaid-hidden');
    figure.remove();
  };
}

function start() {
  const renderer = createRenderer();
  const blocks = new Map();
  const removed = new Set();
  const style = document.createElement('style');
  style.textContent = styleText;
  document.head.append(style);

  function clear(block) {
    const state = blocks.get(block);
    if (!state) return;
    blocks.delete(block);
    clearTimeout(state.timer);
    state.unmount?.();
  }

  function inspect(block) {
    if (!block.isConnected) return;
    const candidate = readBlock(block);
    const current = blocks.get(block);
    if (candidate && candidate.source === current?.source && candidate.pre === current.pre) return;
    clear(block);
    if (!candidate?.source.trim() || candidate.source.length > 16000) return;
    const state = {...candidate};
    blocks.set(block, state);
    state.timer = setTimeout(async () => {
      const diagram = await renderer.render(state.source);
      if (diagram && blocks.get(block) === state && state.pre.isConnected) {
        state.unmount = mountDiagram(block, state.source, diagram);
      }
    }, 450);
  }

  function collect(node, result) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return;
    const block = closestBlock(element);
    if (block) result.add(block);
    if (element === node) for (const child of element.querySelectorAll(blockSelector)) result.add(closestBlock(child));
  }

  const observer = new MutationObserver(records => {
    const changed = new Set();
    for (const record of records) {
      const parent = (record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement);
      const block = closestBlock(parent);
      if (block) changed.add(block);
      for (const node of record.addedNodes) collect(node, changed);
      for (const node of record.removedNodes) collect(node, removed);
    }
    for (const block of removed) if (!block.isConnected) clear(block);
    removed.clear();
    for (const block of changed) inspect(block);
  });
  observer.observe(document.body, {subtree:true, childList:true, characterData:true});
  for (const block of new Set([...document.querySelectorAll(blockSelector)].map(closestBlock))) inspect(block);
  return () => {
    observer.disconnect();
    for (const block of blocks.keys()) clear(block);
    renderer.dispose();
    style.remove();
  };
}

window.__ModuleLoader__.load({
  id:'@local/dsh-plugin-inline-mermaid',
  factory() {
    return {inject:[], apply(ctx) { ctx.effect(start, 'inline mermaid renderer'); }};
  },
});
