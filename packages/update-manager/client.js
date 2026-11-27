window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-update-manager',
  factory(require) {
    const {createElement: h, useId, useState} = require('react');
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
      minHeight: 36, background: 'transparent', border: '1px solid currentColor',
    };

    function apply(ctx) {
      function UpdatePanel() {
        const [report, setReport] = useState(null);
        const [pending, setPending] = useState('');
        const [error, setError] = useState('');
        const releaseStatusId = useId();

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
        const canDownload = !pending && !error && release?.status === 'compatible-release';
        const releaseStatus = pending === 'check' ? 'Checking installed extensions and GitHub releases…'
          : pending === 'stage' ? 'Downloading Render UI and verifying its checksum…'
          : error ? 'Check again to refresh the available actions.'
          : !release ? 'Check for updates to see if a Render UI download is available.'
          : labels[release.status] ?? 'The release status is unavailable. Check again.';
        return h('section', {style:{padding:16, maxWidth:720, overflowWrap:'anywhere'}, 'aria-label':'Extension Update Manager'},
          h('h2', {style:{margin:'0 0 12px'}}, 'Extension Update Manager'),
          h('p', {style:{margin:'0 0 12px', maxWidth:'65ch'}},
            'Check compatibility for installed extensions. Render UI downloads are managed here.'),
          h('button', {type:'button', style:buttonStyle, 'aria-disabled':Boolean(pending),
            onClick:() => { if (!pending) void request('check'); },
          }, 'Check for updates'),
          error && h('p', {role:'alert'}, error),
          mismatches.length > 0 && h('p', {role:'status'},
            `Needs a compatible build: ${mismatches.map(extension => extension.name).join(', ')}.`),
          h('section', {style:rowStyle, 'aria-label':'Render UI update'},
            h('h3', {style:{margin:'0 0 6px'}}, 'Render UI update', release?.version ? ` · ${release.version}` : ''),
            h('p', {id:releaseStatusId, role:'status', 'aria-atomic':true, style:{margin:'0 0 10px'}}, releaseStatus),
            h('button', {type:'button', style:buttonStyle, 'aria-disabled':!canDownload,
              'aria-describedby':releaseStatusId,
              onClick:() => { if (canDownload) void request('stage'); },
            }, 'Download and verify Render UI'),
            release?.reason && h('p', null, release.reason),
            release?.status === 'staged' && h('p', null, 'Installation from this panel is pending.'),
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
                  && h('p', {style:{margin:'6px 0'}}, 'Update Manager checks compatibility for this extension. To update it, get a build for this DSH version from its maintainer.'),
                (needsReview || incompatible) && h('details', {style:{marginTop:8}},
                  h('summary', null, 'Compatibility details'),
                  extension.error && h('p', null, `Could not read the installed package (${extension.error}).`),
                  extension.missingClientPackages?.length > 0 && h('p', null,
                    `Client packages unavailable: ${extension.missingClientPackages.join(', ')}`),
                  ...peers.filter(peer => peer.status !== 'match').map(peer => h('div', {key:peer.name},
                    `${peer.name} requires ${peer.declared}. Installed version: ${peer.actual ?? 'unavailable'}.`)),
                ),
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
