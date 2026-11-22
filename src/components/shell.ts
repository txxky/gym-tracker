import { h, svg, clear } from '../lib/dom';
import { ICON } from '../lib/icons';
import { getProfile } from '../lib/profile';
import { navCount, navigate } from '../lib/router';
import { paintAvatar } from './avatar';
import { cycleTheme, getThemePref, type ThemePref } from '../lib/theme';

const TABS = [
  { path: '/training', label: 'Training', icon: ICON.training },
  { path: '/splits', label: 'Splits', icon: ICON.splits },
  { path: '/progress', label: 'Fortschritt', icon: ICON.progress },
  { path: '/settings', label: 'Einstellungen', icon: ICON.settings },
];

const THEME_ICON: Record<ThemePref, string> = { system: ICON.auto, light: ICON.sun, dark: ICON.moon };
const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Hell', dark: 'Dunkel' };

export const APP_NAME = 'Zero Lift';

const header = h('header', { class: 'app-header' });
const leftEl = h('div', { class: 'app-header-left' });
const smallTitle = h('div', { class: 'app-header-title', 'data-testid': 'small-title' });
const actionsEl = h('div', { class: 'app-header-actions' });
const themeBtn = h('button', { class: 'icon-btn', type: 'button', 'data-testid': 'theme-toggle' });
const rightEl = h('div', { class: 'app-header-right' }, actionsEl, themeBtn);
const largeTitle = h('h1', { class: 'large-title t-large-title', 'data-testid': 'large-title' });
const main = h('main', { class: 'app-main', id: 'main' });
const scroller = h('div', { class: 'app-scroll', 'data-testid': 'scroller' }, largeTitle, main);
const brand = h('a', { class: 'brand', href: '#/training', 'aria-label': `${APP_NAME}, zum Training`, 'data-testid': 'brand' },
  svg(ICON.logo, 'icon brand-logo'), h('span', { class: 'brand-name' }, APP_NAME));
const calendarBtn = h('a', { class: 'icon-btn', href: '#/calendar', 'aria-label': 'Kalender', 'data-testid': 'open-calendar' }, svg(ICON.calendar));
const avatarEl = h('span', { class: 'avatar' });
const avatarBtn = h('a', { class: 'avatar-btn', href: '#/profile', 'aria-label': 'Profil', 'data-testid': 'open-profile' }, avatarEl);
let avatarUrl: string | null = null;
async function paintProfile(): Promise<void> {
  const p = await getProfile();
  if (avatarUrl) URL.revokeObjectURL(avatarUrl);
  avatarUrl = paintAvatar(avatarEl, p);
  avatarBtn.setAttribute('aria-label', p.username ? `Profil von ${p.username}` : 'Profil');
}
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
  window.addEventListener('profilechange', () => { void paintProfile(); });
  void paintProfile();

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
  /** Zurück geht einen Schritt im Verlauf (statt zu einem festen Ziel), solange man in der App war */
  historyBack?: boolean;
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

export function setHeader({ title, back, historyBack = false, actions = [], large = true }: HeaderOptions): void {
  document.title = `${title} · ${APP_NAME}`;
  smallTitle.textContent = title;
  largeTitle.textContent = title;
  largeTitle.hidden = !large;
  // Es gibt genau eine Seitenüberschrift für Screenreader: der große Titel (h1), sonst der kleine in der Leiste.
  if (large) { smallTitle.setAttribute('aria-hidden', 'true'); smallTitle.removeAttribute('role'); }
  else { smallTitle.removeAttribute('aria-hidden'); smallTitle.setAttribute('role', 'heading'); smallTitle.setAttribute('aria-level', '1'); }
  clear(leftEl);
  if (back) {
    const a = h('a', { class: 'icon-btn', href: `#${back}`, 'aria-label': 'Zurück', 'data-testid': 'back' }, svg(ICON.back));
    if (historyBack) {
      a.addEventListener('click', (e) => {
        if (navCount > 1) { e.preventDefault(); history.back(); } else { e.preventDefault(); navigate(back); }
      });
    }
    leftEl.appendChild(a);
  } else {
    // Hauptscreens: Hantel und Name immer links (das Profil sitzt rechts)
    leftEl.appendChild(brand);
  }
  // Auf Hauptscreens trägt die Marke die Leiste; der kleine Titel würde dort mit den Symbolen kollidieren.
  smallTitle.hidden = !back;
  header.classList.toggle('has-brand', !back);
  clear(actionsEl);
  // Kalender-Shortcut und Profil-Avatar nur auf den Hauptscreens (wo links die Marke steht), nicht mitten im Logging
  actionsEl.append(...actions, ...(back ? [] : [calendarBtn]));
  // Reihenfolge rechts: Aktionen, Kalender, Theme, Profil
  rightEl.replaceChildren(actionsEl, themeBtn, ...(back ? [] : [avatarBtn]));
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
