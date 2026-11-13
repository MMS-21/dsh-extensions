/** Strict, bounded model-input validation shared by execution and metadata projection. */
import { normalizeOpenUi } from './openui-validate.js';
import { normalizeDashboardUi } from './dashboard-validate.js';
import { validateDataOptions } from './data-snapshot.js';
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function fail(message) { throw new TypeError(`Invalid UI spec: ${message}`); }
function object(value, keys, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${at} must be a plain object`);
  for (const key of Object.keys(value)) if (forbidden.has(key) || !keys.includes(key)) fail(`${at}.${key} is not supported`);
  return value;
}

/** Validate model arguments and return a fresh JSON-compatible OpenUI presentation spec. */
export function normalizeSpec(args) {
  object(args, ['lang', 'miniApp', 'title', 'library', 'placement', 'dataFile', 'selectionKeys', 'revisionOf'], 'arguments');
  validateDataOptions(args);
  if (args.library !== undefined && args.library !== 'standard' && args.library !== 'dashboard') fail('library must be "standard" or "dashboard"');
  if (args.placement !== undefined && !['inline', 'artifact'].includes(args.placement)) fail('placement must be "inline" or "artifact"');
  if (args.lang === undefined && args.miniApp === undefined) fail('lang is required for OpenUI, or supply miniApp');
  let spec;
  if (args.miniApp !== undefined) {
    if (args.lang !== undefined || args.library !== undefined || args.placement === 'inline') fail('miniApp opens in the artifact panel and cannot be combined with lang or library');
    object(args.miniApp, ['html', 'css', 'code'], 'miniApp');
    const {html, css = '', code} = args.miniApp;
    if (typeof html !== 'string' || !html.trim() || html.length > 24000
      || typeof css !== 'string' || css.length > 10000
      || typeof code !== 'string' || !code.trim() || code.length > 16000) {
      fail('miniApp requires HTML up to 24,000 characters and JavaScript up to 16,000 characters. Optional CSS is limited to 10,000 characters');
    }
    if (args.title !== undefined && (typeof args.title !== 'string' || args.title.length > 200)) fail('title must be at most 200 characters');
    spec = {view:'mini-app', placement:'artifact', title:args.title ?? 'Interactive tool', miniApp:{html, css, code}};
  } else {
    spec = args.library === 'dashboard' ? normalizeDashboardUi(args.lang, args.title) : normalizeOpenUi(args.lang, args.title);
  }
  if (args.revisionOf !== undefined) {
    let target;
    try {
      if (typeof args.revisionOf === 'string' && args.revisionOf.length <= 600) target = JSON.parse(args.revisionOf);
    } catch {}
    if (!Array.isArray(target) || target.length !== 2 || typeof target[0] !== 'string'
      || !target[0] || !Number.isSafeInteger(target[1]) || target[1] < 1) fail('revisionOf must be the saved artifact revision reference');
    return {...spec, placement: 'artifact', revisionOf: target};
  }
  return args.placement === 'artifact' || (args.placement === undefined && args.library === 'dashboard')
    ? {...spec, placement: 'artifact'} : spec;
}
