import { h, svg, clear } from '../lib/dom';
import { ICON } from '../lib/icons';
import { cycleTheme, getThemePref, type ThemePref } from '../lib/theme';

const TABS = [
  { path: '/training', label: 'Training', icon: ICON.training },
  { path: '/splits', label: 'Splits', icon: ICON.splits },
  { path: '/progress', label: 'Fortschritt', icon: ICON.progress },
  { path: '/settings', label: 'Einstellungen', icon: ICON.settings },
];

const THEME_ICON: Record<ThemePref, string> = { system: ICON.auto, light: ICON.sun, dark: ICON.moon };
const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Hell', dark: 'Dunkel' };

const titleEl = h('h1', { class: 'app-title' });
const leftEl = h('div', { class: 'app-header-left' });
const actionsEl = h('div', { class: 'app-header-actions' });
const themeBtn = h('button', { class: 'icon-btn', type: 'button', 'data-testid': 'theme-toggle' });
const main = h('main', { class: 'app-main', id: 'main' });
const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Hauptnavigation' });

function paintThemeBtn(): void {
  const pref = getThemePref();
  clear(themeBtn);
  themeBtn.appendChild(svg(THEME_ICON[pref]));
  themeBtn.setAttribute('aria-label', `Design: ${THEME_LABEL[pref]}. Tippen zum Wechseln`);
}

export function mountShell(app: HTMLElement): HTMLElement {
  themeBtn.addEventListener('click', () => {
    cycleTheme();
  });
  window.addEventListener('themechange', paintThemeBtn);
  paintThemeBtn();

  for (const t of TABS) {
    tabbar.appendChild(
      h('a', { class: 'tab', href: `#${t.path}`, 'data-path': t.path, 'data-testid': `tab-${t.path.slice(1)}` }, svg(t.icon), h('span', null, t.label)),
    );
  }
  app.append(h('header', { class: 'app-header' }, leftEl, titleEl, h('div', { class: 'app-header-right' }, actionsEl, themeBtn)), main, tabbar);
  return main;
}

export interface HeaderOptions {
  title: string;
  /** Ziel des Zurück-Pfeils (Hash-Pfad) */
  back?: string;
  actions?: HTMLElement[];
}

export function setHeader({ title, back, actions = [] }: HeaderOptions): void {
  titleEl.textContent = title;
  document.title = `${title} · Gym Tracker`;
  clear(leftEl);
  if (back) {
    leftEl.appendChild(h('a', { class: 'icon-btn', href: `#${back}`, 'aria-label': 'Zurück' }, svg(ICON.back)));
  }
  clear(actionsEl);
  actionsEl.append(...actions);
}

export function setActiveTab(path: string): void {
  tabbar.querySelectorAll<HTMLElement>('.tab').forEach((a) => {
    const on = path.startsWith(a.dataset.path!);
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
