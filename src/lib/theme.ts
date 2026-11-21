export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'gt-theme';
const ORDER: ThemePref[] = ['system', 'light', 'dark'];

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* localStorage kann fehlen (privater Modus) */
  }
  return 'system';
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme(pref, dark));
  root.setAttribute('data-theme-pref', pref);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', cssVar('--bg'));
  window.dispatchEvent(new CustomEvent('themechange'));
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignorieren */
  }
  applyTheme(pref);
}

export function cycleTheme(): ThemePref {
  const next = ORDER[(ORDER.indexOf(getThemePref()) + 1) % ORDER.length];
  setThemePref(next);
  return next;
}

export function initTheme(): void {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}
