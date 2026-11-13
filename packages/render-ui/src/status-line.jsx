/**
 * Live status line for the composer dock.
 *
 * A compact ambient row under the composer card, in the spirit of Claude Code's
 * status line: working directory, live context occupancy, token usage, and
 * session activity in one glanceable strip. Every figure rides the session
 * projections, so the row updates as the durable log advances — no model turn.
 *
 * The component is registered into `conversation.composer.dock` (a session-scoped
 * list slot) and receives the framework's `useProjection` seat plus the locale
 * seat when one is declared.
 */
import React from 'react';
import {useShellTheme} from './use-shell-theme.js';

/** Compact token reading: 950 → "950", 12 400 → "12.4k", 1 240 000 → "1.2M". */
function formatTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n / 100_000) / 10}M`;
}

/** Compact duration: 45.2s under a minute, 2m42s from there on. */
function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const s = n / 1000;
  if (s < 60) return `${Math.round(s * 10) / 10}s`;
  const whole = Math.round(s);
  return `${Math.floor(whole / 60)}m${whole % 60}s`;
}

/** Basename of a directory path, tolerating both separators. */
function baseName(path) {
  if (typeof path !== 'string' || path === '') return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? null;
}

export function LiveStatusLine({useProjection, t}) {
  const mode = useShellTheme();
  const pressure = useProjection('contextPressure');
  const usage = useProjection('tokenUsage');
  const stats = useProjection('sessionStats');
  const workingDirectory = useProjection('workingDirectory');

  const dark = mode === 'dark';
  const fg = dark ? '#cbd5e1' : '#475569';
  const muted = dark ? '#64748b' : '#94a3b8';
  const accent = dark ? '#38bdf8' : '#0284c7';

  const used = pressure?.projectedTokens ?? pressure?.pressureTokens ?? 0;
  const window = pressure?.contextWindow ?? 0;
  const percent = window > 0 && used > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0;
  const billedInput = (usage?.uncachedInputTokens ?? 0) + (usage?.cacheReadTokens ?? 0) + (usage?.cacheWriteTokens ?? 0);
  const totalTokens = billedInput + (usage?.outputTokens ?? 0);
  const duration = formatDuration(stats?.llmMs ?? 0);
  const directory = baseName(workingDirectory);

  const segments = [];
  if (directory) segments.push(<span key="dir" style={{display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0}}>
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden style={{flex: 'none', opacity: .8}}>
      <path d="M1.5 3.5a1 1 0 0 1 1-1h3l1.5 1.5h5.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
    <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{directory}</span>
  </span>);

  segments.push(
    <span key="ctx" style={{display: 'inline-flex', alignItems: 'center', gap: 6}} aria-label={t ? t('context.aria', {percent}) : `${percent}% context`}>
      <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke={muted} strokeWidth="1.6" />
        <circle
          cx="7" cy="7" r="5.5" fill="none" stroke={accent} strokeWidth="1.6"
          strokeDasharray={`${(2 * Math.PI * 5.5) * percent / 100} ${2 * Math.PI * 5.5}`}
          transform="rotate(-90 7 7)" strokeLinecap="round"
        />
      </svg>
      <span style={{fontVariantNumeric: 'tabular-nums'}}>{`${percent}%`}</span>
    </span>,
  );

  if (window > 0) segments.push(
    <span key="tokens" style={{fontVariantNumeric: 'tabular-nums'}}>
      {`${formatTokens(used)}/${formatTokens(window)}`}
    </span>,
  );

  if (totalTokens > 0) segments.push(
    <span key="total" style={{fontVariantNumeric: 'tabular-nums', opacity: .85}}>
      {`Σ ${formatTokens(totalTokens)}`}
    </span>,
  );

  if (stats && stats.turns > 0) segments.push(
    <span key="activity" style={{fontVariantNumeric: 'tabular-nums', opacity: .85}}>
      {`${stats.turns}×${stats.steps}`}
    </span>,
  );

  if (duration !== null) segments.push(
    <span key="duration" style={{fontVariantNumeric: 'tabular-nums', opacity: .85}}>{duration}</span>,
  );

  return (
    <span
      data-composer-stat="render-ui"
      style={{display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: fg, font: '11px/1.4 system-ui, sans-serif'}}
    >
      {segments.map((segment, index) => (
        <React.Fragment key={segment.key}>
          {index > 0 && <span aria-hidden style={{color: muted}}>·</span>}
          {segment}
        </React.Fragment>
      ))}
    </span>
  );
}

/** Locale dictionaries for the status line; English and Simplified Chinese. */
export const STATUS_DICTIONARIES = {
  en: {'context.aria': '{percent}% context used'},
  zh: {'context.aria': '上下文已用 {percent}%'},
};

/** Slot registration; safe to call in compositions without the dock or locale. */
export function registerStatusLine(ctx, dockName = 'conversation.composer.dock') {
  if (!ctx.slots || typeof ctx.slots.register !== 'function') return;
  const hasLocale = Boolean(ctx.locale && typeof ctx.locale.register === 'function');
  if (hasLocale) {
    try { ctx.locale.register('render-ui.status', STATUS_DICTIONARIES); } catch {}
  }
  try {
    ctx.slots.inject(dockName, () => ctx.slots.register({
      name: dockName,
      id: 'render-ui:status',
      order: 2,
      ...(hasLocale ? {locale: 'render-ui.status'} : {}),
    }, LiveStatusLine));
  } catch {}
}
