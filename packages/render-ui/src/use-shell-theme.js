import {useEffect, useState} from 'react';

/**
 * Track the shell's color scheme.
 *
 * The Desktop shell marks dark mode with `data-ds-dark-theme` on <body>; the
 * fallbacks cover a plain browser page and the OS preference.
 */
export function useShellTheme() {
  const [mode, setMode] = useState(() => {
    if (typeof document === 'undefined') return 'light';
    if (document.body && document.body.hasAttribute('data-ds-dark-theme')) return 'dark';
    if (document.documentElement.classList.contains('dark')) return 'dark';
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => {
      let next = 'light';
      if (document.body && document.body.hasAttribute('data-ds-dark-theme')) next = 'dark';
      else if (document.documentElement.classList.contains('dark')) next = 'dark';
      else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) next = 'dark';
      setMode(next);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {attributes: true, attributeFilter: ['data-ds-dark-theme', 'class']});
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class', 'data-theme']});
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (mql) mql.addEventListener('change', update);
    return () => {
      observer.disconnect();
      if (mql) mql.removeEventListener('change', update);
    };
  }, []);
  return mode;
}
