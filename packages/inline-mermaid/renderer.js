import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad:false, securityLevel:'strict', htmlLabels:false,
  suppressErrorRendering:true, maxTextSize:16000, maxEdges:300,
  theme:'base', look:'classic',
  flowchart:{nodeSpacing:28, rankSpacing:30, padding:13, diagramPadding:8, curve:'linear', wrappingWidth:180},
  themeVariables:{
    darkMode:true, background:'#131316',
    primaryColor:'#20243a', primaryTextColor:'#ebedff', primaryBorderColor:'#484e6a',
    lineColor:'#8c96b2', secondaryColor:'#292d48', tertiaryColor:'#1a1e30',
    edgeLabelBackground:'#1b2032', fontFamily:'system-ui, sans-serif', fontSize:'15px',
  },
});

function prepareDiagram(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const width = Number(root.getAttribute('viewBox')?.trim().split(/\s+/)[2]);
  if (root.getAttribute('aria-roledescription') === 'flowchart-v2') {
    for (const node of doc.querySelectorAll('g.node > rect')) {
      if (!node.hasAttribute('rx') || Number(node.getAttribute('rx')) === 0) {
        node.setAttribute('rx', '8');
        node.setAttribute('ry', '8');
      }
    }
    svg = new XMLSerializer().serializeToString(doc);
  }
  return {svg, width};
}

window.addEventListener('message', async event => {
  if (event.source !== window.parent || event.data?.type !== 'dsh-mermaid-render') return;
  const {id, source} = event.data;
  try {
    if (typeof source !== 'string' || source.length > 16000) throw Error('Diagram is too large');
    const {svg} = await mermaid.render(`diagram-${id}`, source);
    window.parent.postMessage({type:'dsh-mermaid-result', id, ...prepareDiagram(svg)}, '*');
  } catch {
    window.parent.postMessage({type:'dsh-mermaid-result', id}, '*');
  }
});
window.parent.postMessage({type:'dsh-mermaid-ready'}, '*');
