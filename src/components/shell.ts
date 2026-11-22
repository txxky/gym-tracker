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

const header = h('header', { class: 'app-header' });
const leftEl = h('div', { class: 'app-header-left' });
const smallTitle = h('div', { class: 'app-header-title', 'data-testid': 'small-title' });
const actionsEl = h('div', { class: 'app-header-actions' });
const themeBtn = h('button', { class: 'icon-btn', type: 'button', 'data-testid': 'theme-toggle' });
const rightEl = h('div', { class: 'app-header-right' }, actionsEl, themeBtn);
const largeTitle = h('h1', { class: 'large-title t-large-title', 'data-testid': 'large-title' });
const main = h('main', { class: 'app-main', id: 'main' });
const scroller = h('div', { class: 'app-scroll', 'data-testid': 'scroller' }, largeTitle, main);
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
  header.append(
    h('div', { class: 'app-header-bg', 'aria-hidden': 'true' }),
    h('div', { class: 'app-header-bar' }, leftEl, smallTitle, rightEl),
  );
  app.append(scroller, header, tabbar);
  return main;
}

export interface HeaderOptions {
  title: string;
  /** Ziel des Zurück-Pfeils (Hash-Pfad) */
  back?: string;
  actions?: HTMLElement[];
  /**
   * Großer Titel im iOS-Stil, der beim Scrollen in den kleinen mittigen Titel der Leiste übergeht.
   * false = nur der kleine Titel (Fokus-Screens wie das Logging, damit der Platz für die Räder bleibt).
   */
  large?: boolean;
}

let collapseObserver: IntersectionObserver | null = null;

/** Leiste wird "eingeklappt" (Material sichtbar, kleiner Titel), sobald der große Titel unter der Leiste verschwunden ist. */
function watchCollapse(large: boolean): void {
  collapseObserver?.disconnect();
  collapseObserver = null;
  if (!large || typeof IntersectionObserver === 'undefined') {
    header.classList.toggle('is-collapsed', true);
    return;
  }
  header.classList.remove('is-collapsed');
  const barPx = Math.round(header.getBoundingClientRect().height);
  collapseObserver = new IntersectionObserver(
    ([entry]) => header.classList.toggle('is-collapsed', !entry.isIntersecting),
    { root: scroller, rootMargin: `-${barPx}px 0px 0px 0px`, threshold: 0 },
  );
  collapseObserver.observe(largeTitle);
}

export function setHeader({ title, back, actions = [], large = true }: HeaderOptions): void {
  document.title = `${title} · Gym Tracker`;
  smallTitle.textContent = title;
  largeTitle.textContent = title;
  largeTitle.hidden = !large;
  // Es gibt genau eine Seitenüberschrift für Screenreader: der große Titel (h1), sonst der kleine in der Leiste.
  if (large) { smallTitle.setAttribute('aria-hidden', 'true'); smallTitle.removeAttribute('role'); }
  else { smallTitle.removeAttribute('aria-hidden'); smallTitle.setAttribute('role', 'heading'); smallTitle.setAttribute('aria-level', '1'); }
  clear(leftEl);
  if (back) {
    leftEl.appendChild(h('a', { class: 'icon-btn', href: `#${back}`, 'aria-label': 'Zurück', 'data-testid': 'back' }, svg(ICON.back)));
  }
  clear(actionsEl);
  actionsEl.append(...actions);
  watchCollapse(large);
}

export function resetScroll(): void {
  scroller.scrollTop = 0;
}

export function setActiveTab(path: string): void {
  tabbar.querySelectorAll<HTMLElement>('.tab').forEach((a) => {
    const on = path.startsWith(a.dataset.path!);
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
