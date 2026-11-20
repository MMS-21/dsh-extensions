/**
 * Client half of the session-delete bundle.
 *
 * Adds a "Delete session…" item to the session row menu (after Archive) and a
 * confirmation dialog in the `shell.overlay` seat. Confirming calls the Host's
 * authenticated `/api/sessionDelete` route through the shared Connection RPC
 * channel, so the destructive work stays behind the same trust fence as every
 * other Host call.
 */
window.__ModuleLoader__.load({
  id: '@local/session-delete',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NAMESPACE = 'session-delete';
    const STYLE_ID = '@local/session-delete/session-delete.css';

    const DICTIONARIES = {
      en: {
        'menu.deleteSession': 'Delete session…',
        'dialog.title': 'Delete session',
        'dialog.message': 'This permanently deletes the session and its stored history. This cannot be undone.',
        'dialog.confirm': 'Delete',
        'dialog.cancel': 'Cancel',
        'dialog.deleting': 'Deleting…',
        'error.generic': 'Could not delete the session.',
      },
      zh: {
        'menu.deleteSession': '删除会话…',
        'dialog.title': '删除会话',
        'dialog.message': '这将永久删除会话及其存储的历史记录，且无法撤销。',
        'dialog.confirm': '删除',
        'dialog.cancel': '取消',
        'dialog.deleting': '正在删除…',
        'error.generic': '无法删除会话。',
      },
    };

    const CSS = [
      '.asd-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1200;padding:24px}',
      '.asd-modal{box-sizing:border-box;width:100%;max-width:420px;background:var(--dsw-specific-input-major,#1f2937);border:1px solid var(--dsw-alias-border-l2,#334155);border-radius:var(--dsw-radius-panel,12px);box-shadow:var(--dsw-elevation-soft,0 12px 32px rgba(0,0,0,.45));padding:20px;color:var(--dsw-alias-label-primary,#e5e7eb)}',
      '.asd-title{margin:0 0 8px;font-size:16px;line-height:22px;font-weight:600}',
      '.asd-message{margin:0 0 12px;font-size:13px;line-height:19px;color:var(--dsw-alias-label-secondary,#9ca3af)}',
      '.asd-session{margin:0 0 12px;font-size:13px;line-height:19px;color:var(--dsw-alias-label-primary,#e5e7eb);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.asd-error{margin:0 0 12px;font-size:12px;line-height:18px;color:#f87171}',
      '.asd-actions{display:flex;justify-content:flex-end;gap:8px}',
      '.asd-actions button{font:inherit;font-size:13px;line-height:18px;padding:6px 14px;border-radius:var(--dsw-radius-sm,6px);border:1px solid transparent;cursor:pointer}',
      '.asd-cancel{background:transparent;color:var(--dsw-alias-label-secondary,#9ca3af);border-color:var(--dsw-alias-border-l2,#334155)}',
      '.asd-cancel:disabled{opacity:.55;cursor:default}',
      '.asd-confirm{background:#dc2626;color:#fff}',
      '.asd-confirm:disabled{opacity:.6;cursor:default}',
    ].join('\n');

    // One pending delete request, shared between the row menu and the dialog.
    let pendingDelete = null;
    const deleteListeners = new Set();
    function emitDeleteChange() {
      for (const listener of deleteListeners) listener();
    }
    function getPendingDelete() {
      return pendingDelete;
    }
    function subscribeToDelete(listener) {
      deleteListeners.add(listener);
      return () => deleteListeners.delete(listener);
    }
    function requestDelete(sessionId, title) {
      pendingDelete = {sessionId, title};
      emitDeleteChange();
    }
    function settleDelete() {
      pendingDelete = null;
      emitDeleteChange();
    }
    function useDeleteRequest() {
      return React.useSyncExternalStore(subscribeToDelete, getPendingDelete, getPendingDelete);
    }

    function ConfirmDeleteDialog({useDeleteRequest: useRequest, settleDelete: settle, deleteSession: deleteSessionRemote, t}) {
      const request = useRequest();
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);

      React.useEffect(() => {
        if (request === null) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape' && !busy) settle();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [request, busy, settle]);

      if (request === null) return null;

      const close = () => {
        if (!busy) settle();
      };
      const confirm = () => {
        setBusy(true);
        setError(null);
        Promise.resolve(deleteSessionRemote(request.sessionId))
          .then((result) => {
            if (result?.ok === false) throw new Error(result.error?.message || t('error.generic'));
            setBusy(false);
            settle();
          })
          .catch((reason) => {
            setBusy(false);
            setError(String(reason?.message || t('error.generic')));
          });
      };

      return h('div', {
        className: 'asd-backdrop',
        onClick: (event) => {
          if (event.target === event.currentTarget) close();
        },
      },
      h('div', {className: 'asd-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'asd-title'},
        h('h2', {id: 'asd-title', className: 'asd-title'}, t('dialog.title')),
        h('p', {className: 'asd-message'}, t('dialog.message')),
        request.title ? h('p', {className: 'asd-session'}, request.title) : null,
        error === null ? null : h('p', {className: 'asd-error', role: 'alert'}, error),
        h('div', {className: 'asd-actions'},
          h('button', {type: 'button', className: 'asd-cancel', onClick: close, disabled: busy}, t('dialog.cancel')),
          h('button', {type: 'button', className: 'asd-confirm', onClick: confirm, disabled: busy}, t(busy ? 'dialog.deleting' : 'dialog.confirm')))));
    }

    function injectStyles(ctx) {
      if (typeof document === 'undefined') return;
      if (document.getElementById(STYLE_ID) !== null) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      if (ctx && typeof ctx.effect === 'function') ctx.effect(() => () => style.remove());
    }

    return {
      inject: ['slots', 'locale', 'contextMenus', 'remoteAccess', 'connection', 'sessions'],
      apply(ctx) {
        injectStyles(ctx);

        let t = (key) => key;
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            const register = () => ctx.locale.register(NAMESPACE, DICTIONARIES);
            if (typeof ctx.effect === 'function') ctx.effect(register, 'session-delete: dictionaries');
            else register();
          }
          if (ctx.locale && typeof ctx.locale.bind === 'function') t = ctx.locale.bind(NAMESPACE);
        } catch (error) {
          console.error('session-delete: locale registration failed', error);
        }

        const deleteSessionRemote = async (sessionId) => {
          const result = await ctx.connection.rpc.call('/api', 'sessionDelete', {sessionId});
          // The Host list is derived from persisted artifacts, so a successful
          // delete needs an explicit pull before the sidebar row can disappear.
          if (result?.ok === true && ctx.sessions && typeof ctx.sessions.refresh === 'function') {
            try {
              ctx.sessions.refresh();
            } catch (error) {
              console.warn('session-delete: session list refresh failed', error);
            }
          }
          return result;
        };

        try {
          if (ctx.slots && typeof ctx.slots.register === 'function') {
            ctx.slots.inject('shell.overlay', () => ctx.slots.register({
              name: 'shell.overlay',
              id: 'session-delete.confirm',
              locale: NAMESPACE,
              inject: () => ({
                useDeleteRequest,
                settleDelete,
                deleteSession: deleteSessionRemote,
              }),
            }, ConfirmDeleteDialog));
          }
        } catch (error) {
          console.error('session-delete: overlay registration failed', error);
        }

        try {
          if (ctx.contextMenus && typeof ctx.contextMenus.register === 'function') {
            const canDelete = (sessionId) =>
              ctx.remoteAccess.source('session', sessionId, 'workspace/archiveSession').getSnapshot() === true;
            ctx.effect(() => ctx.contextMenus.register({
              id: 'session.delete',
              target: 'session',
              order: 700,
              observe: ({sessionId}) => [
                ctx.locale,
                ctx.remoteAccess.source('session', sessionId, 'workspace/archiveSession'),
              ],
              resolve: (target) => {
                if (!canDelete(target.sessionId)) return [];
                return [{
                  id: 'delete',
                  label: t('menu.deleteSession'),
                  icon: {key: 'workspace.delete'},
                  separatorBefore: true,
                  run: () => requestDelete(target.sessionId, target.displayTitle),
                }];
              },
            }), 'session-delete: delete menu');
          }
        } catch (error) {
          console.error('session-delete: menu registration failed', error);
        }
      },
    };
  },
});
