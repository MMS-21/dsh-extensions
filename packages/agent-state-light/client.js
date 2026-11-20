/**
 * Agent state light — a glowing traffic-light indicator for the composer dock.
 *
 * One compact row under the message composer: red / yellow / green / blue dots,
 * with the active state glowing and a short label beside it. It reads the same
 * session projections and status seats the shell uses, so it updates as the
 * durable session log advances and needs no model turn of its own.
 *
 * State mapping:
 *   blue   working   — a turn is running (or a prompt is in flight)
 *   yellow waiting   — the agent is blocked on the user (approval / question)
 *   green  ready     — idle, loaded, nothing outstanding
 *   red    error     — the session reported an error or was removed
 */
window.__ModuleLoader__.load({
  id: '@local/agent-state-light',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NAMESPACE = 'agent-state-light';
    const STYLE_ID = '@local/agent-state-light/state-light.css';

    const DICTIONARIES = {
      en: {
        'state.working': 'Working',
        'state.waiting': 'Waiting for you',
        'state.ready': 'Ready',
        'state.error': 'Error',
        'state.working.detail': 'The agent is implementing a task.',
        'state.waiting.detail': 'The agent is waiting for your input or approval.',
        'state.ready.detail': 'The agent is idle and ready for your next message.',
        'state.error.detail': 'The session reported an error.',
        legend: 'Blue: working · Yellow: waiting for you · Green: ready · Red: error',
      },
      zh: {
        'state.working': '正在工作',
        'state.waiting': '等待你的输入',
        'state.ready': '就绪',
        'state.error': '出错',
        'state.working.detail': '代理正在执行任务。',
        'state.waiting.detail': '代理正在等待你的输入或批准。',
        'state.ready.detail': '代理空闲，可以接收你的下一条消息。',
        'state.error.detail': '会话报告了一个错误。',
        legend: '蓝色：正在工作 · 黄色：等待你的输入 · 绿色：就绪 · 红色：出错',
      },
    };

    const CSS = [
      '.asl_root{display:inline-flex;align-items:center;gap:8px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:20px;white-space:nowrap}',
      '.asl_dots{display:inline-flex;align-items:center;gap:5px}',
      '.asl_dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);opacity:.25;flex:none}',
      '.asl_dot[data-active="true"]{opacity:1}',
      '.asl_dot[data-active="true"][data-color="red"]{background:#f87171;box-shadow:0 0 6px 1px rgba(248,113,113,.85),0 0 12px 3px rgba(248,113,113,.4)}',
      '.asl_dot[data-active="true"][data-color="yellow"]{background:#fbbf24;box-shadow:0 0 6px 1px rgba(251,191,36,.85),0 0 12px 3px rgba(251,191,36,.4)}',
      '.asl_dot[data-active="true"][data-color="green"]{background:#4ade80;box-shadow:0 0 6px 1px rgba(74,222,128,.85),0 0 12px 3px rgba(74,222,128,.4)}',
      '.asl_dot[data-active="true"][data-color="blue"]{background:#60a5fa;box-shadow:0 0 6px 1px rgba(96,165,250,.85),0 0 12px 3px rgba(96,165,250,.4);animation:asl-pulse 1.8s ease-in-out infinite}',
      '@keyframes asl-pulse{0%,100%{box-shadow:0 0 6px 1px rgba(96,165,250,.85),0 0 12px 3px rgba(96,165,250,.4)}50%{box-shadow:0 0 8px 2px rgba(96,165,250,1),0 0 16px 5px rgba(96,165,250,.55)}}',
      '.asl_label{font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}',
      '@media (prefers-reduced-motion:reduce){.asl_dot[data-active="true"][data-color="blue"]{animation:none}}',
    ].join('\n');

    // Traffic-light order: red, yellow, green, plus blue for the working state.
    const STATES = [
      { key: 'error', color: 'red' },
      { key: 'waiting', color: 'yellow' },
      { key: 'ready', color: 'green' },
      { key: 'working', color: 'blue' },
    ];

    function deriveState(session, pendingInteraction, phase) {
      if (session === null || session === undefined || session.removed === true) return 'error';
      if (session.openState === 'error' || session.openError != null) return 'error';
      if (session.lastAgentError != null || session.promptError != null) return 'error';
      if (pendingInteraction != null) return 'waiting';
      if (session.running === true) return 'working';
      if (phase === 'sending' || phase === 'submitting' || phase === 'adjudicating') return 'working';
      return 'ready';
    }

    function AgentStateLight(props) {
      const useSession = props.useSession;
      const useSessionStatus = props.useSessionStatus;
      const useInput = props.useInput;
      const t = props.t;

      const running = useSession((s) => s.running === true);
      const removed = useSession((s) => s.removed === true);
      const openState = useSession((s) => s.openState);
      const openError = useSession((s) => s.openError);
      const lastAgentError = useSession((s) => s.lastAgentError);
      const promptError = useSession((s) => s.promptError);
      const sessionId = props.sessionId;
      const pendingInteraction = useSessionStatus((s) =>
        sessionId === undefined ? undefined : s.get(sessionId)?.pendingInteraction);
      const phase = useInput((s) => s.phase);

      const stateKey = deriveState({
        running,
        removed,
        openState,
        openError,
        lastAgentError,
        promptError,
      }, pendingInteraction, phase);

      const label = typeof t === 'function' ? t(`state.${stateKey}`) : stateKey;
      const detail = typeof t === 'function' ? t(`state.${stateKey}.detail`) : '';
      const legend = typeof t === 'function' ? t('legend') : '';
      const title = legend ? `${detail} ${legend}`.trim() : detail;

      return h('span', {
        className: 'asl_root',
        title,
        'data-agent-state': stateKey,
      },
      h('span', { className: 'asl_dots', 'aria-hidden': true },
        STATES.map((state) => h('span', {
          key: state.key,
          className: 'asl_dot',
          'data-color': state.color,
          'data-active': state.key === stateKey ? 'true' : 'false',
        }))),
      h('span', { className: 'asl_label' }, label));
    }

    function injectStyles(ctx) {
      if (typeof document === 'undefined') return;
      if (document.getElementById(STYLE_ID) !== null) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      if (ctx && typeof ctx.effect === 'function') {
        ctx.effect(() => () => style.remove());
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        injectStyles(ctx);
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            if (typeof ctx.effect === 'function') {
              ctx.effect(() => ctx.locale.register(NAMESPACE, DICTIONARIES), 'agent-state-light: dictionaries');
            } else {
              ctx.locale.register(NAMESPACE, DICTIONARIES);
            }
          }
        } catch (error) {
          console.error('agent-state-light: locale registration failed', error);
        }
        try {
          if (ctx.slots && typeof ctx.slots.register === 'function') {
            ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
              name: 'conversation.composer.dock',
              id: 'agent-state-light',
              order: 5,
              locale: NAMESPACE,
            }, AgentStateLight));
          }
        } catch (error) {
          console.error('agent-state-light: dock registration failed', error);
        }
      },
    };
  },
});
