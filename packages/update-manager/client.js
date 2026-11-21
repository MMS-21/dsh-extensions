window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-update-manager',
  factory(require) {
    const {createElement: h, useState} = require('react');
    const labels = {
      'no-newer-release': 'No newer Render UI release was found.',
      'compatible-release': 'A compatible release is available.',
      'incomplete-release': 'The release is missing its verification files.',
      'invalid-release': 'The release metadata failed verification.',
      'incompatible-release': 'The release does not match this DSH runtime.',
      'not-inspected': 'Render UI is unavailable in this profile.',
      'check-failed': 'The update request failed.',
      staged: 'The verified archive is ready for installation.',
    };
    const rowStyle = {
      padding: '12px 0',
      borderBottom: '1px solid color-mix(in srgb, currentColor 15%, transparent)',
    };
    const buttonStyle = {
      font: 'inherit', color: 'inherit', padding: '6px 12px', borderRadius: 7,
      background: 'transparent', border: '1px solid currentColor',
    };

    function apply(ctx) {
      function UpdatePanel() {
        const [report, setReport] = useState(null);
        const [pending, setPending] = useState('');
        const [error, setError] = useState('');

        async function request(action) {
          setPending(action);
          setError('');
          try {
            const response = await ctx.connection.rpc.call('/api', `extension-updates/${action}`, {});
            if (!response?.ok) throw Error(response?.error?.message ?? 'The DSH update service did not respond.');
            setReport(response.value);
          } catch (cause) {
            setError(cause.message);
          } finally {
            setPending('');
          }
        }

        const release = report?.renderUi;
        const extensions = report?.extensions ?? [];
        const mismatches = extensions.filter(extension => extension.peers?.some(peer => peer.status === 'mismatch'));
        return h('section', {style:{padding:16, maxWidth:720}, 'aria-label':'Extension Update Manager'},
          h('h2', {style:{margin:'0 0 12px'}}, 'Extension Update Manager'),
          h('div', {style:{display:'flex', gap:8, flexWrap:'wrap'}},
            h('button', {type:'button', style:buttonStyle, disabled:Boolean(pending), onClick:() => request('check')},
              pending === 'check' ? 'Checking…' : 'Check for updates'),
            release?.status === 'compatible-release' && h('button', {
              type:'button', style:buttonStyle, disabled:Boolean(pending), onClick:() => request('stage'),
            }, pending === 'stage' ? 'Verifying…' : 'Download and verify'),
          ),
          error && h('p', {role:'alert'}, error),
          mismatches.length > 0 && h('p', {role:'status'},
            `Incompatible with this DSH version: ${mismatches.map(extension => extension.name).join(', ')}.`),
          release && h('div', {style:rowStyle, role:'status'},
            h('strong', null, 'Render UI release check', release.version ? ` · ${release.version}` : ''),
            h('p', {style:{margin:'6px 0'}}, labels[release.status] ?? release.status),
            release.reason && h('p', null, release.reason),
          ),
          report && h('div', null,
            h('h3', null, 'Installed extensions'),
            ...extensions.map(extension => {
              const peers = extension.peers ?? [];
              const incompatible = peers.some(peer => peer.status === 'mismatch');
              const needsReview = extension.error || extension.missingClientPackages?.length
                || peers.some(peer => peer.status !== 'match');
              return h('div', {key:extension.name, style:rowStyle},
                h('strong', null, extension.name),
                extension.version && h('span', null, ` · ${extension.version}`),
                h('div', null, incompatible ? 'Incompatible · needs a compatible extension build'
                  : needsReview ? 'Compatibility needs review' : peers.length ? 'DSH peers match' : 'No DSH peer pins declared'),
                incompatible && extension.name !== '@local/dsh-plugin-render-ui'
                  && h('div', null, 'Release lookup for this extension is unavailable in Update Manager.'),
                ...peers.filter(peer => peer.status !== 'match').map(peer => h('div', {key:peer.name},
                  `${peer.name}: requires ${peer.declared}, found ${peer.actual ?? 'no package'}`)),
              );
            }),
          ),
        );
      }

      ctx.slots.inject('plugins.tab', () => ctx.slots.register({
        name:'plugins.tab',
        id:'extension-updates',
        label:() => 'Extension Updates',
      }, UpdatePanel));
    }

    return {apply, inject:['slots', 'connection']};
  },
});
